using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Standalone product shell. The local Express server owns task state and keys.
namespace DaytownApplication {
 public sealed class AppWindow : Form {
  readonly Uri baseUri;
  readonly WebView2 view=new WebView2();
  readonly Panel loading=new Panel();
  readonly Label status=new Label();
  readonly Button retry=new Button();
  readonly EventWaitHandle restoreRequest;
  readonly System.Windows.Forms.Timer restoreTimer=new System.Windows.Forms.Timer();
  bool initializing,closed;
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);

  public AppWindow(string baseUrl,EventWaitHandle restore) {
   Uri parsed;
   if(!Uri.TryCreate(baseUrl,UriKind.Absolute,out parsed)||parsed.Scheme!="http"||!parsed.IsLoopback)throw new ArgumentException("Daytown only opens its localhost server.");
   baseUri=new Uri(parsed.GetLeftPart(UriPartial.Authority)+"/");restoreRequest=restore;
   Text="Daytown";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1000,800);MinimumSize=new Size(840,600);BackColor=Color.FromArgb(20,27,25);ForeColor=Color.FromArgb(234,240,224);Font=new Font("Segoe UI",9f);AutoScaleMode=AutoScaleMode.Dpi;
   view.Dock=DockStyle.Fill;view.DefaultBackgroundColor=BackColor;view.Visible=false;
   loading.Dock=DockStyle.Fill;loading.BackColor=BackColor;
   status.Dock=DockStyle.Fill;status.TextAlign=ContentAlignment.MiddleCenter;status.Padding=new Padding(40);status.Font=new Font("Segoe UI",12f);status.Text="Opening Daytown...";
   retry.Text="Try again";retry.Dock=DockStyle.Bottom;retry.Height=44;retry.FlatStyle=FlatStyle.Flat;retry.BackColor=Color.FromArgb(43,60,45);retry.ForeColor=ForeColor;retry.Visible=false;
   retry.Click+=async delegate{await InitializeAsync();};loading.Controls.Add(status);loading.Controls.Add(retry);Controls.Add(view);Controls.Add(loading);
   Shown+=async delegate{await InitializeAsync();};
   restoreTimer.Interval=500;restoreTimer.Tick+=delegate{if(restoreRequest.WaitOne(0)){if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Show();Activate();BringToFront();}};restoreTimer.Start();
   FormClosed+=delegate{closed=true;restoreTimer.Stop();restoreTimer.Dispose();view.Dispose();};
  }
  protected override void OnHandleCreated(EventArgs args){base.OnHandleCreated(args);try{int dark=1;DwmSetWindowAttribute(Handle,20,ref dark,4);}catch{} }
  bool IsLocalOrigin(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme==baseUri.Scheme&&String.Equals(uri.Host,baseUri.Host,StringComparison.OrdinalIgnoreCase)&&uri.Port==baseUri.Port;}
  async Task InitializeAsync(){
   if(initializing||closed)return;initializing=true;retry.Visible=false;status.Text="Opening Daytown...";loading.Visible=true;loading.BringToFront();
   try {
    if(view.CoreWebView2==null){
     string profile=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"webview-profile");Directory.CreateDirectory(profile);
     CoreWebView2Environment environment=await CoreWebView2Environment.CreateAsync(null,profile,null);
     if(closed)return;
     await view.EnsureCoreWebView2Async(environment);
     if(closed)return;
     CoreWebView2 core=view.CoreWebView2;
     core.Settings.AreDefaultContextMenusEnabled=false;
     core.Settings.AreDevToolsEnabled=false;
     core.Settings.IsStatusBarEnabled=false;
     core.Settings.AreDefaultScriptDialogsEnabled=false;
     core.Settings.AreHostObjectsAllowed=false;
     core.Settings.IsWebMessageEnabled=false;
     core.Settings.IsPasswordAutosaveEnabled=false;
     core.Settings.IsGeneralAutofillEnabled=false;
     core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs args){args.State=IsLocalOrigin(args.Uri)&&args.PermissionKind==CoreWebView2PermissionKind.Microphone?CoreWebView2PermissionState.Allow:CoreWebView2PermissionState.Deny;args.SavesInProfile=false;args.Handled=true;};
     core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs args){if(!IsLocalOrigin(args.Uri))args.Cancel=true;};
     core.FrameNavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs args){if(!IsLocalOrigin(args.Uri))args.Cancel=true;};
     core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs args){args.Handled=true;};
     core.NavigationCompleted+=delegate(object sender,CoreWebView2NavigationCompletedEventArgs args){
      if(closed)return;
      if(args.IsSuccess){loading.Visible=false;view.Visible=true;view.BringToFront();view.Focus();}
      else {status.Text="Daytown could not reach its local server.\r\nKeep Daytown's server running and try again.";retry.Visible=true;loading.Visible=true;loading.BringToFront();Log("Local dashboard navigation failed: "+args.WebErrorStatus);}
     };
     core.ProcessFailed+=delegate(object sender,CoreWebView2ProcessFailedEventArgs args){if(!closed){status.Text="The Daytown view stopped. Close and reopen Daytown to continue.";retry.Visible=false;loading.Visible=true;loading.BringToFront();Log("WebView process failed: "+args.ProcessFailedKind);}};
    }
    Uri target=new Uri(baseUri,"/?app=1");
    if(view.Source!=null&&view.Source.AbsoluteUri==target.AbsoluteUri)view.CoreWebView2.Reload();else view.Source=target;
   }catch(Exception error){Log(error.GetType().Name+": "+error.Message);if(!closed){status.Text="Daytown could not open its app view.\r\nThe Microsoft Edge WebView2 Runtime is required.\r\nYour local tasks remain saved.";retry.Visible=true;loading.Visible=true;loading.BringToFront();}}
   finally{initializing=false;}
  }
  static void Log(string text){try{File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-app.log"),DateTime.UtcNow.ToString("o")+" "+text+Environment.NewLine);}catch{} }
 }
 public static class Program {
  [STAThread] public static void Main(string[] args){
   bool first;
   using(Mutex mutex=new Mutex(true,"Local\\DaytownApp",out first)){
    if(!first){try{using(EventWaitHandle restore=EventWaitHandle.OpenExisting("Local\\DaytownAppRestore")){restore.Set();}}catch{}return;}
    using(EventWaitHandle restore=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\DaytownAppRestore")){
     try{Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new AppWindow(args.Length>0?args[0]:"http://localhost:3000",restore));}
     catch(Exception error){try{File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-app.log"),DateTime.UtcNow.ToString("o")+" "+error.GetType().Name+": "+error.Message+Environment.NewLine);}catch{}}
    }
   }
  }
 }
}
