using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Globalization;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// A product window, not an automation helper. Only localhost state and PNGs enter it.
namespace DaytownDesktop {
 public sealed class LocalClient : WebClient {
  public int RequestTimeout=1400;
  public LocalClient() { Proxy = null; }
  protected override WebRequest GetWebRequest(Uri address) { WebRequest request = base.GetWebRequest(address); request.Timeout = RequestTimeout; HttpWebRequest http = request as HttpWebRequest; if (http != null) http.ReadWriteTimeout = RequestTimeout; return request; }
 }
 public sealed class PetWindow : Form {
  const int WS_EX_LAYERED=0x80000, WS_EX_TOOLWINDOW=0x80, WS_EX_NOACTIVATE=0x08000000;
  const int WM_NCHITTEST=0x84, HTCLIENT=1, HTTRANSPARENT=-1;
  const byte AC_SRC_OVER=0, AC_SRC_ALPHA=1; const int ULW_ALPHA=2;
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X,Y; public POINT(int x,int y){X=x;Y=y;} }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int Width,Height; public SIZE(int w,int h){Width=w;Height=h;} }
  [StructLayout(LayoutKind.Sequential,Pack=1)] struct BLENDFUNCTION { public byte BlendOp,BlendFlags,SourceConstantAlpha,AlphaFormat; }
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("user32.dll",SetLastError=true)] static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dstDc,ref POINT dst,ref SIZE size,IntPtr srcDc,ref POINT src,int colorKey,ref BLENDFUNCTION blend,int flags);
  [DllImport("user32.dll")] static extern bool ReleaseCapture();
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd,int msg,IntPtr wparam,IntPtr lparam);
  readonly Uri baseUri; readonly string clientId="native-"+Guid.NewGuid().ToString("N");
  readonly Dictionary<string,Bitmap> images = new Dictionary<string,Bitmap>();
  readonly System.Windows.Forms.Timer tick = new System.Windows.Forms.Timer();
  readonly System.Windows.Forms.Timer hoverTimer = new System.Windows.Forms.Timer();
  readonly Rectangle sceneArea = new Rectangle(10,35,320,210);
  readonly Rectangle spriteArea = new Rectangle(148,119,64,69);
  readonly Rectangle signArea = new Rectangle(174,57,140,24);
  readonly Rectangle cardArea = new Rectangle(8,189,324,50);
  readonly Rectangle doneArea = new Rectangle(10,243,50,21),talkArea=new Rectangle(65,243,50,21),openArea=new Rectangle(120,243,50,21),voiceArea=new Rectangle(175,243,92,21),closeArea=new Rectangle(272,243,58,21);
  readonly Rectangle timerArea=new Rectangle(176,85,150,29),coachingArea=new Rectangle(144,22,186,32);
  readonly HashSet<string> observedReminders=new HashSet<string>();
  Bitmap sprite,canvas,workbench;Bitmap[] workingFrames=new Bitmap[0],idleFrames=new Bitmap[0];string[] taskNotes=new string[0];int animationIndex,remainingTasks,completedTasks;
  string stage="egg",step="Open Daytown to add a tiny step.",taskId="",upcomingLabel="",reminderLabel=""; bool hovered,walking,upcomingSign,previewSaved,signDrawn,hasWork,alive,allowAnimation;
  volatile bool fetching,closing,voiceEnabled; Rectangle drawnSpriteArea; double drawnOpacity=1;
  System.Media.SoundPlayer activePlayer;
  DateTime lastPresence=DateTime.MinValue,stageSince=DateTime.UtcNow,signUntil=DateTime.MinValue,lastStateAt=DateTime.MinValue; int direction=-1;
  double pressure,workedMs,focusDurationMs=300000,breakDurationMs=300000;bool awaitingHatch,popPrimed;int pressureBand=-1;string workStartedAt="",focusUntil="",breakUntil="",dueAt="",lastPopMarker="",coaching="";
  DateTimeOffset serverClock=DateTimeOffset.UtcNow;DateTime popUntil=DateTime.MinValue,popStarted=DateTime.MinValue,confettiUntil=DateTime.MinValue,coachingUntil=DateTime.MinValue;Bitmap popActor;
  public PetWindow(string url,bool walk) {
   Uri parsed; if(!Uri.TryCreate(url,UriKind.Absolute,out parsed)||!parsed.IsLoopback||parsed.Scheme!="http")throw new ArgumentException("Daytown desktop only connects to localhost HTTP.");
   baseUri=parsed;walking=walk;
   Text="Daytown workbench";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;ClientSize=new Size(340,270);allowAnimation=SystemInformation.IsMenuAnimationEnabled;
   Rectangle work=Screen.PrimaryScreen.WorkingArea;Location=new Point(work.Right-365,work.Bottom-290);
   tick.Interval=1000;tick.Tick+=delegate{Poll();};
   drawnSpriteArea=spriteArea;
   hoverTimer.Interval=150;hoverTimer.Tick+=delegate { Point point=PointToClient(Cursor.Position);bool inside=hovered?new Rectangle(4,20,332,246).Contains(point):HitInteractive(point);bool redraw=inside!=hovered;hovered=inside;Bitmap[] frames=hasWork?workingFrames:idleFrames;if(allowAnimation&&alive&&stage=="happy"&&frames.Length>1){animationIndex=(animationIndex+1)%frames.Length;redraw=true;}if(walking&&!hovered){Rectangle area=Screen.FromControl(this).WorkingArea;if(Left<=area.Left||Right>=area.Right)direction=-direction;Left+=direction;redraw=true;}if(redraw||stage=="ghost"||stage=="eating"||stage=="critical"||signUntil>DateTime.UtcNow||signDrawn||upcomingSign||coachingUntil>DateTime.UtcNow||popUntil>DateTime.UtcNow||confettiUntil>DateTime.UtcNow||pressure>=65)Render(); };
   Shown+=delegate{Render();Poll();tick.Start();hoverTimer.Start();};
   FormClosing+=delegate{closing=true;voiceEnabled=false;tick.Stop();hoverTimer.Stop();if(activePlayer!=null){try{activePlayer.Stop();}catch{}}try{Post("/api/pet-presence",new Dictionary<string,object>{{"clientId",clientId},{"open",false}});}catch{} };
   FormClosed+=delegate{foreach(Bitmap image in images.Values)image.Dispose();if(canvas!=null)canvas.Dispose();};
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { CreateParams value=base.CreateParams;value.ExStyle|=WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE;return value; } }
  bool HitInteractive(Point point) {
   return canvas!=null&&point.X>=0&&point.Y>=0&&point.X<canvas.Width&&point.Y<canvas.Height&&canvas.GetPixel(point.X,point.Y).A>24;
  }
  protected override void WndProc(ref Message message) {
   if(message.Msg==WM_NCHITTEST){long packed=message.LParam.ToInt64();Point point=PointToClient(new Point((short)(packed&0xffff),(short)((packed>>16)&0xffff)));message.Result=new IntPtr(HitInteractive(point)?HTCLIENT:HTTRANSPARENT);return;}base.WndProc(ref message);
  }
  protected override void OnMouseDown(MouseEventArgs e) {
   base.OnMouseDown(e);if(e.Button!=MouseButtons.Left)return;
   if(hovered&&closeArea.Contains(e.Location)){Close();return;}
   if(hovered&&voiceArea.Contains(e.Location)){voiceEnabled=!voiceEnabled;if(!voiceEnabled&&activePlayer!=null){try{activePlayer.Stop();}catch{}}Render();return;}
   if(hovered&&talkArea.Contains(e.Location)){ThreadPool.QueueUserWorkItem(delegate{try{using(LocalClient client=new LocalClient()){client.RequestTimeout=30000;client.Headers[HttpRequestHeader.ContentType]="application/json";client.UploadString(LocalUri("/api/companion-launch"),"POST","{}");}}catch(Exception error){Log(error);}});return;}
   if(hovered&&openArea.Contains(e.Location)){ThreadPool.QueueUserWorkItem(delegate{try{using(LocalClient client=new LocalClient()){client.RequestTimeout=30000;client.Headers[HttpRequestHeader.ContentType]="application/json";client.UploadString(LocalUri("/api/app-launch"),"POST","{}");}}catch(Exception error){Log(error);}});return;}
   if(hovered&&doneArea.Contains(e.Location)){if(taskId.Length>0){string id=taskId;ThreadPool.QueueUserWorkItem(delegate{try{Post("/api/action",new Dictionary<string,object>{{"action","done"},{"taskId",id}});Poll();}catch(Exception error){Log(error);}});}return;}
   if(HitInteractive(e.Location)){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
  }
  Uri LocalUri(string relative) { Uri target=new Uri(baseUri,relative);if(!target.IsLoopback||target.Scheme!="http"||target.Port!=baseUri.Port)throw new InvalidOperationException("Only the local Daytown server is allowed.");return target; }
  Dictionary<string,object> Get(string path) { using(LocalClient client=new LocalClient())return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(client.DownloadString(LocalUri(path))); }
  void Post(string path,Dictionary<string,object> data) { using(LocalClient client=new LocalClient()){client.Headers[HttpRequestHeader.ContentType]="application/json";client.UploadString(LocalUri(path),"POST",new JavaScriptSerializer().Serialize(data));} }
  Bitmap LoadBitmap(string asset,bool trim) {
   string key=(trim?"trim:":"raw:")+asset;Bitmap image;if(images.TryGetValue(key,out image))return image;
   using(LocalClient client=new LocalClient())using(MemoryStream bytes=new MemoryStream(client.DownloadData(LocalUri(asset))))using(Bitmap original=new Bitmap(bytes)){image=trim?Trim(original):new Bitmap(original);images[key]=image;return image;}
  }
  Bitmap[] LoadFrames(Dictionary<string,object> animations,string name){object raw;if(animations==null||!animations.TryGetValue(name,out raw))return new Bitmap[0];System.Collections.IEnumerable paths=raw as System.Collections.IEnumerable;if(paths==null||raw is string)return new Bitmap[0];List<Bitmap> frames=new List<Bitmap>();foreach(object value in paths){if(value!=null){try{frames.Add(LoadBitmap(Convert.ToString(value),false));}catch(Exception error){Log(error);}}if(frames.Count==6)break;}return frames.ToArray();}
  void SpeakReminder(string id,string firedAt,string line) {
   if(!voiceEnabled||closing)return;
   ThreadPool.QueueUserWorkItem(delegate {
    try {
     if(!voiceEnabled||closing)return;
     using(LocalClient client=new LocalClient()) {
      client.Headers[HttpRequestHeader.ContentType]="application/json";
      string claim=client.UploadString(LocalUri("/api/reminders/claim"),"POST",new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"taskId",id},{"reminderAt",firedAt}}));
      Dictionary<string,object> result=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(claim);
      object claimed;if(!result.TryGetValue("claimed",out claimed)||!Convert.ToBoolean(claimed)||!voiceEnabled||closing)return;
     }
     using(LocalClient client=new LocalClient()) {
      client.RequestTimeout=30000;client.Headers[HttpRequestHeader.ContentType]="application/json";
      byte[] audio=client.UploadData(LocalUri("/api/tts"),"POST",System.Text.Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"text",line},{"format","wav"}})));
      if(!voiceEnabled||closing)return;
      using(MemoryStream stream=new MemoryStream(audio))using(System.Media.SoundPlayer player=new System.Media.SoundPlayer(stream)){activePlayer=player;try{if(voiceEnabled&&!closing)player.PlaySync();}finally{activePlayer=null;}}
     }
    }catch(Exception error){Log(error);}
   });
  }
  public void Poll() {
   if(fetching||closing)return;fetching=true;
   ThreadPool.QueueUserWorkItem(delegate {
    try {
     Dictionary<string,object> state=Get("/api/state"),assets=Get("/api/assets");Dictionary<string,object> pet=(Dictionary<string,object>)state["pet"];
     string nextStage=Convert.ToString(pet["stage"]),nextId=state["nextTaskId"]==null?"":Convert.ToString(state["nextTaskId"]),nextStep="Open Daytown to add a tiny step.",nextUpcomingLabel="",freshLabel="",freshId="",freshAt="",freshLine="";bool nextUpcoming=false,nextHasWork=false;int nextRemaining=0,nextCompleted=0;List<string> nextNotes=new List<string>();string nextTitle="",nextDue="";double nextWorkedMs=0,nextPressure=Math.Max(0,Math.Min(100,NumberValue(state,"pressure"))),nextFocusDuration=NumberValue(state,"focusDurationMs"),nextBreakDuration=NumberValue(state,"breakDurationMs");bool nextAwaiting=Convert.ToBoolean(pet["awaitingHatch"]);string nextFocus=StringValue(state,"focusUntil"),nextBreak=StringValue(state,"breakUntil"),nextPop=StringValue(state,"lastPopAt"),nextStarted="";
     object sessionValue;if(state.TryGetValue("workSession",out sessionValue)){Dictionary<string,object> session=sessionValue as Dictionary<string,object>;if(session!=null&&StringValue(session,"taskId")==nextId)nextStarted=StringValue(session,"startedAt");}
     DateTimeOffset stateNow; if(!DateTimeOffset.TryParse(Convert.ToString(state["now"]),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out stateNow))stateNow=DateTimeOffset.UtcNow;
     System.Collections.IEnumerable tasks=state["tasks"] as System.Collections.IEnumerable;if(tasks!=null)foreach(object raw in tasks){Dictionary<string,object> task=raw as Dictionary<string,object>;if(task==null)continue;string id=Convert.ToString(task["id"]);bool unfinished=Convert.ToString(task["status"])!="done";if(unfinished){nextRemaining++;nextHasWork=true;string title=ShortLabel(task);if(id==nextId)nextTitle=title;else if(nextNotes.Count<2)nextNotes.Add(title);}else nextCompleted++;
      if(id==nextId){nextStep=Convert.ToString(task["tiny_first_step"]);nextDue=StringValue(task,"due");nextWorkedMs=NumberValue(task,"workedMs");DateTimeOffset reminderAt;object reminderValue;if(unfinished&&task.TryGetValue("remind_at",out reminderValue)&&DateTimeOffset.TryParse(Convert.ToString(reminderValue),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out reminderAt)){double ahead=(reminderAt-stateNow).TotalMinutes;nextUpcoming=ahead>0&&ahead<=15;nextUpcomingLabel=ShortLabel(task);}}
      object firedValue;DateTimeOffset firedAt;if(unfinished&&task.TryGetValue("reminderFiredAt",out firedValue)&&DateTimeOffset.TryParse(Convert.ToString(firedValue),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out firedAt)){string key=id+"|"+Convert.ToString(firedValue);double age=(stateNow-firedAt).TotalSeconds;if(!observedReminders.Contains(key)){observedReminders.Add(key);if(age>=0&&age<=8&&(freshLabel.Length==0||id==nextId)){freshLabel=ShortLabel(task);freshId=id;freshAt=Convert.ToString(firedValue);DateTimeOffset dueAt;object dueValue;int minutes=task.TryGetValue("due",out dueValue)&&DateTimeOffset.TryParse(Convert.ToString(dueValue),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out dueAt)?(int)Math.Round((dueAt-stateNow).TotalMinutes):0;freshLine=minutes>0?freshLabel+" in "+minutes+" "+(minutes==1?"minute!":"minutes!"):"Time for "+freshLabel+". One tiny step.";}}}
     }
     if(observedReminders.Count>128)observedReminders.Clear();
     if(freshId.Length>0&&voiceEnabled)SpeakReminder(freshId,freshAt,freshLine);
     if(nextAwaiting&&nextStage=="egg")nextStep="One tiny step will hatch a fresh start.";
     if(nextTitle.Length>0)nextNotes.Insert(0,nextTitle);if(nextNotes.Count>2)nextNotes.RemoveRange(2,nextNotes.Count-2);
     Dictionary<string,object> pets=assets["pet"] as Dictionary<string,object>;object pathObject;Bitmap nextSprite=null,nextWorkbench=null;Bitmap[] nextWorking=new Bitmap[0],nextIdle=new Bitmap[0];
     if(pets!=null&&pets.TryGetValue(nextStage,out pathObject)&&pathObject!=null)nextSprite=LoadBitmap(Convert.ToString(pathObject),false);
     if(assets.TryGetValue("workbench",out pathObject)&&pathObject!=null)nextWorkbench=LoadBitmap(Convert.ToString(pathObject),false);
     object animationsValue;if(assets.TryGetValue("petAnimations",out animationsValue)){Dictionary<string,object> animations=animationsValue as Dictionary<string,object>;nextWorking=LoadFrames(animations,"working");nextIdle=LoadFrames(animations,"idle");}
     bool nextAlive=Convert.ToDouble(pet["health"])>0&&nextStage!="egg"&&nextStage!="ghost";
     if(!closing&&(DateTime.UtcNow-lastPresence).TotalSeconds>=15){Post("/api/pet-presence",new Dictionary<string,object>{{"clientId",clientId},{"open",true}});lastPresence=DateTime.UtcNow;}
     if(!closing&&IsHandleCreated)BeginInvoke((Action)delegate{
      bool freshPop=popPrimed&&nextPop.Length>0&&nextPop!=lastPopMarker;
      if(!popPrimed)popPrimed=true;lastPopMarker=nextPop;
      if(freshPop){popActor=sprite;Bitmap[] before=hasWork?workingFrames:idleFrames;if(alive&&stage=="happy"&&before.Length>0)popActor=before[animationIndex%before.Length];popStarted=DateTime.UtcNow;popUntil=popStarted.AddMilliseconds(600);confettiUntil=popStarted.AddMilliseconds(1500);}
      if(stage!=nextStage){stage=nextStage;stageSince=freshPop?DateTime.UtcNow.AddMilliseconds(600):DateTime.UtcNow;}
      int nextBand=nextPressure>=85?3:nextPressure>=65?2:nextPressure>=35?1:0;
      if(pressureBand>=0&&nextBand>pressureBand&&nextAlive&&!nextAwaiting&&!Future(nextFocus,stateNow)&&!Future(nextBreak,stateNow)){coaching=nextBand==3?"One small step, then a breather.":nextBand==2?"Tiny progress is still progress.":"Let’s pick one little thing.";coachingUntil=DateTime.UtcNow.AddSeconds(8);}
      pressureBand=nextBand;pressure=nextPressure;awaitingHatch=nextAwaiting;workedMs=nextWorkedMs;workStartedAt=nextStarted;focusUntil=nextFocus;breakUntil=nextBreak;dueAt=nextDue;focusDurationMs=nextFocusDuration>0?nextFocusDuration:300000;breakDurationMs=nextBreakDuration>0?nextBreakDuration:300000;serverClock=stateNow;
      if(nextAwaiting){coachingUntil=DateTime.MinValue;signUntil=DateTime.MinValue;}
      taskId=nextId;step=nextStep;hasWork=nextHasWork;alive=nextAlive;remainingTasks=nextRemaining;completedTasks=nextCompleted;taskNotes=nextNotes.ToArray();if(nextWorking.Length>0)workingFrames=nextWorking;if(nextIdle.Length>0)idleFrames=nextIdle;if(nextWorkbench!=null)workbench=nextWorkbench;upcomingSign=nextUpcoming&&!nextAwaiting;upcomingLabel=nextUpcomingLabel;lastStateAt=DateTime.UtcNow;if(freshLabel.Length>0&&!nextAwaiting){reminderLabel=freshLabel;signUntil=DateTime.UtcNow.AddSeconds(8);}if(nextSprite!=null)sprite=nextSprite;Render();});
    }catch(Exception error){Log(error);}finally{fetching=false;}
   });
  }
  static string ShortLabel(Dictionary<string,object> task){object value;string label=task.TryGetValue("label",out value)?Convert.ToString(value):"Tiny step";return label.Length>18?label.Substring(0,18):label;}
  static string StringValue(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
  static double NumberValue(Dictionary<string,object> data,string key){object value;double number;return data.TryGetValue(key,out value)&&value!=null&&double.TryParse(Convert.ToString(value),NumberStyles.Any,CultureInfo.InvariantCulture,out number)?Math.Max(0,number):0;}
  static bool Future(string value,DateTimeOffset now){DateTimeOffset target;return DateTimeOffset.TryParse(value,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out target)&&target>now;}
  static string Clock(double milliseconds){int seconds=(int)Math.Max(0,Math.Floor(milliseconds/1000));return (seconds/60).ToString("00")+":"+(seconds%60).ToString("00");}
  static Bitmap Trim(Bitmap original) { int left=original.Width,top=original.Height,right=-1,bottom=-1;for(int y=0;y<original.Height;y+=3)for(int x=0;x<original.Width;x+=3)if(original.GetPixel(x,y).A>36){left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);}if(right<left)return new Bitmap(original);Rectangle crop=Rectangle.FromLTRB(Math.Max(0,left-5),Math.Max(0,top-5),Math.Min(original.Width,right+6),Math.Min(original.Height,bottom+6));return original.Clone(crop,PixelFormat.Format32bppArgb); }
  static GraphicsPath Rounded(Rectangle rectangle,int radius) { GraphicsPath path=new GraphicsPath();path.AddArc(rectangle.X,rectangle.Y,radius,radius,180,90);path.AddArc(rectangle.Right-radius,rectangle.Y,radius,radius,270,90);path.AddArc(rectangle.Right-radius,rectangle.Bottom-radius,radius,radius,0,90);path.AddArc(rectangle.X,rectangle.Bottom-radius,radius,radius,90,90);path.CloseFigure();return path; }
  void DrawTimer(Graphics g){
   DateTimeOffset now=serverClock.AddSeconds(Math.Max(0,(DateTime.UtcNow-lastStateAt).TotalSeconds)),started,target;
   double elapsedWork=workedMs;if(DateTimeOffset.TryParse(workStartedAt,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out started))elapsedWork+=Math.Max(0,(now-started).TotalMilliseconds);
   string first="Work "+Clock(elapsedWork),second="5 min block";double progress=Math.Min(1,elapsedWork/300000);Color fill=Color.FromArgb(255,107,163,137);
   if(DateTimeOffset.TryParse(breakUntil,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out target)&&target>now){second="Break "+Clock((target-now).TotalMilliseconds);progress=(target-now).TotalMilliseconds/breakDurationMs;fill=Color.FromArgb(255,138,167,122);}
   else if(DateTimeOffset.TryParse(focusUntil,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out target)&&target>now){second="Focus "+Clock((target-now).TotalMilliseconds);progress=(target-now).TotalMilliseconds/focusDurationMs;fill=Color.FromArgb(255,210,165,96);}
   else if(DateTimeOffset.TryParse(dueAt,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out target))first+=target>now?" · due "+Clock((target-now).TotalMilliseconds):" · due now";
   progress=Math.Max(0,Math.Min(1,progress));Rectangle card=new Rectangle(timerArea.X,timerArea.Y,timerArea.Width,38),bar=new Rectangle(timerArea.X+3,timerArea.Y+31,timerArea.Width-6,5);
   using(Brush paper=new SolidBrush(Color.FromArgb(242,245,241,215)))g.FillRectangle(paper,card);
   using(Font font=new Font("Segoe UI",7f,FontStyle.Regular))using(Brush ink=new SolidBrush(Color.FromArgb(255,65,81,61))){StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;g.DrawString(first,font,ink,new RectangleF(timerArea.X,timerArea.Y+2,timerArea.Width,13),format);g.DrawString(second,font,ink,new RectangleF(timerArea.X,timerArea.Y+15,timerArea.Width,13),format);}
   using(Brush track=new SolidBrush(Color.FromArgb(255,211,217,190)))using(GraphicsPath shape=Rounded(bar,4))g.FillPath(track,shape);
   int width=(int)Math.Round(bar.Width*progress);if(width>0)using(Brush colour=new SolidBrush(fill)){Rectangle part=new Rectangle(bar.X,bar.Y,width,bar.Height);if(width>=4)using(GraphicsPath shape=Rounded(part,4))g.FillPath(colour,shape);else g.FillRectangle(colour,part);}
  }
  void Render() {
   if(!IsHandleCreated||closing)return;Bitmap frame=new Bitmap(Width,Height,PixelFormat.Format32bppArgb);
   using(Graphics g=Graphics.FromImage(frame)){g.Clear(Color.Transparent);g.SmoothingMode=SmoothingMode.AntiAlias;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    using(Brush shadow=new SolidBrush(Color.FromArgb(35,32,50,46)))g.FillEllipse(shadow,16,182,316,71);
    using(Brush floor=new SolidBrush(Color.FromArgb(245,182,199,172)))g.FillPolygon(floor,new Point[]{new Point(12,177),new Point(207,158),new Point(334,222),new Point(130,252)});
    using(Brush edge=new SolidBrush(Color.FromArgb(255,129,151,126)))g.FillPolygon(edge,new Point[]{new Point(12,177),new Point(130,252),new Point(130,259),new Point(12,184)});
    using(Brush edge=new SolidBrush(Color.FromArgb(255,112,136,116)))g.FillPolygon(edge,new Point[]{new Point(130,252),new Point(334,222),new Point(334,229),new Point(130,259)});
    using(Pen seam=new Pen(Color.FromArgb(85,237,236,203),1)){g.DrawLine(seam,55,193,247,174);g.DrawLine(seam,95,218,288,198);g.DrawLine(seam,133,242,326,222);}
    if(workbench!=null)g.DrawImage(workbench,sceneArea);else{using(Brush top=new SolidBrush(Color.FromArgb(250,159,125,84)))g.FillPolygon(top,new Point[]{new Point(45,145),new Point(290,145),new Point(320,195),new Point(20,195)});using(Brush legs=new SolidBrush(Color.FromArgb(255,95,94,68))){g.FillRectangle(legs,44,194,12,39);g.FillRectangle(legs,286,194,12,39);}using(Brush screen=new SolidBrush(Color.FromArgb(255,67,80,67)))g.FillRectangle(screen,207,83,68,50);using(Brush glow=new SolidBrush(Color.FromArgb(255,166,188,130)))g.FillRectangle(glow,214,89,54,37);}
    using(Brush boardShadow=new SolidBrush(Color.FromArgb(45,30,43,35)))g.FillRectangle(boardShadow,15,42,125,110);
    using(Brush frameWood=new SolidBrush(Color.FromArgb(255,138,110,76)))g.FillRectangle(frameWood,12,38,125,110);
    using(Brush cork=new SolidBrush(Color.FromArgb(255,221,209,169)))g.FillRectangle(cork,18,44,113,98);
    using(Pen edge=new Pen(Color.FromArgb(255,103,91,64),1))g.DrawRectangle(edge,12,38,125,110);
    using(Font titleFont=new Font("Segoe UI",8f,FontStyle.Bold))using(Font noteFont=new Font("Segoe UI",7f,FontStyle.Regular))using(Font tinyFont=new Font("Segoe UI",6.5f,FontStyle.Regular))using(Brush noteText=new SolidBrush(Color.FromArgb(255,65,68,48))){StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;format.LineAlignment=StringAlignment.Center;format.Trimming=StringTrimming.EllipsisCharacter;g.DrawString(remainingTasks+" tasks left",titleFont,noteText,new RectangleF(21,47,107,17),format);g.DrawString(completedTasks+" completed",tinyFont,noteText,new RectangleF(21,64,107,13),format);for(int i=0;i<taskNotes.Length&&i<2;i++){Rectangle note=new Rectangle(22,82+i*24,105,20);using(Brush paper=new SolidBrush(i==0?Color.FromArgb(255,251,232,157):Color.FromArgb(255,225,234,188)))g.FillRectangle(paper,note);using(Brush pin=new SolidBrush(Color.FromArgb(255,117,108,78)))g.FillEllipse(pin,note.X+49,note.Y+1,4,4);g.DrawString(taskNotes[i],noteFont,noteText,new RectangleF(note.X+3,note.Y+4,note.Width-6,note.Height-4),format);}if(remainingTasks>2)g.DrawString("+"+(remainingTasks-2)+" more",tinyFont,noteText,new RectangleF(21,129,107,13),format);}
    double elapsed=Math.Max(0,(DateTime.UtcNow-stageSince).TotalSeconds);drawnSpriteArea=spriteArea;drawnOpacity=1;
    bool popping=DateTime.UtcNow<popUntil,pressureActive=alive&&hasWork&&!awaitingHatch;
    if(stage=="ghost"&&!popping){drawnSpriteArea.Offset(0,-(int)(Math.Min(4,elapsed)*14));drawnOpacity=Math.Max(0,1-elapsed/4);}
    else if(stage=="eating")drawnSpriteArea.Offset(0,-(int)(Math.Abs(Math.Sin(elapsed*Math.PI*3))*3));
    else if(stage=="critical")drawnOpacity=.94+.06*(.5+.5*Math.Sin(elapsed*Math.PI));
    Bitmap actor=sprite;Bitmap[] frames=hasWork?workingFrames:idleFrames;if(alive&&stage=="happy"&&frames.Length>0)actor=frames[allowAnimation?animationIndex%frames.Length:0];
    if(pressureActive){double amount=pressure/100,scale=1+amount*.35;int width=(int)Math.Round(spriteArea.Width*scale),height=(int)Math.Round(spriteArea.Height*scale);drawnSpriteArea=new Rectangle(spriteArea.X-(width-spriteArea.Width)/2,spriteArea.Bottom-height,width,height);if(allowAnimation&&pressure>=65)drawnSpriteArea.Offset((int)Math.Round(Math.Sin(DateTime.UtcNow.Ticks/800000.0)*amount*3),0);if(pressure>=35)using(Brush glow=new SolidBrush(Color.FromArgb((int)(20+amount*35),229,pressure>=75?96:165,67)))g.FillEllipse(glow,drawnSpriteArea.X-5,drawnSpriteArea.Y-4,drawnSpriteArea.Width+10,drawnSpriteArea.Height+8);}
    if(popping){actor=popActor??actor;double progress=Math.Max(0,Math.Min(1,(DateTime.UtcNow-popStarted).TotalMilliseconds/600));double scale=1.35+progress*.35;int width=(int)(spriteArea.Width*scale),height=(int)(spriteArea.Height*scale);drawnSpriteArea=new Rectangle(spriteArea.X-(width-spriteArea.Width)/2,spriteArea.Bottom-height,width,height);drawnOpacity=progress<.6?1:Math.Max(0,(1-progress)/.4);}
    g.InterpolationMode=InterpolationMode.NearestNeighbor;g.PixelOffsetMode=PixelOffsetMode.Half;
    if(actor!=null){using(ImageAttributes attributes=new ImageAttributes()){ColorMatrix matrix=new ColorMatrix();matrix.Matrix33=(float)drawnOpacity;if(pressureActive){float amount=(float)(pressure/100);matrix.Matrix11=1-amount*.4f;matrix.Matrix22=1-amount*.65f;matrix.Matrix40=amount*.12f;}attributes.SetColorMatrix(matrix);g.DrawImage(actor,drawnSpriteArea,0,0,actor.Width,actor.Height,GraphicsUnit.Pixel,attributes);}}else{using(Brush body=new SolidBrush(Color.FromArgb((int)(255*drawnOpacity),188,216,153)))g.FillEllipse(body,drawnSpriteArea);using(Brush eye=new SolidBrush(Color.FromArgb((int)(255*drawnOpacity),53,74,48))){g.FillEllipse(eye,164,112,4,6);g.FillEllipse(eye,183,112,4,6);}}
    g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.Default;
    if(DateTime.UtcNow<confettiUntil&&allowAnimation){double progress=Math.Max(0,Math.Min(1,(DateTime.UtcNow-popStarted).TotalMilliseconds/1500));Color[] colours={Color.FromArgb(130,211,170),Color.FromArgb(235,181,99),Color.FromArgb(187,160,218),Color.FromArgb(222,119,107)};for(int i=0;i<22;i++){double angle=i*2.39996,distance=progress*(35+i%5*9);int x=spriteArea.X+spriteArea.Width/2+(int)(Math.Cos(angle)*distance),y=spriteArea.Y+spriteArea.Height/2+(int)(Math.Sin(angle)*distance+progress*progress*45);using(Brush piece=new SolidBrush(Color.FromArgb((int)((1-progress)*245),colours[i%colours.Length])))g.FillRectangle(piece,x,y,4,6);}}
    DrawTimer(g);
    bool showFresh=DateTime.UtcNow<signUntil,showUpcoming=upcomingSign&&(DateTime.UtcNow-lastStateAt).TotalSeconds<5;
    signDrawn=!hovered&&(showFresh||showUpcoming);
    if(signDrawn){using(Brush fill=new SolidBrush(Color.FromArgb(238,249,246,223)))using(GraphicsPath shape=Rounded(signArea,10))g.FillPath(fill,shape);using(Font signFont=new Font("Segoe UI",8f,FontStyle.Bold))using(Brush ink=new SolidBrush(Color.FromArgb(255,68,86,53))){StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;format.LineAlignment=StringAlignment.Center;format.Trimming=StringTrimming.EllipsisCharacter;g.DrawString(showFresh?reminderLabel:upcomingLabel,signFont,ink,signArea,format);}}
    if(!awaitingHatch&&DateTime.UtcNow<coachingUntil&&!showFresh&&!showUpcoming){using(Brush paper=new SolidBrush(Color.FromArgb(242,248,243,221)))using(GraphicsPath shape=Rounded(coachingArea,10))g.FillPath(paper,shape);using(Font font=new Font("Segoe UI",7f,FontStyle.Regular))using(Brush ink=new SolidBrush(Color.FromArgb(255,68,86,53))){StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;format.LineAlignment=StringAlignment.Center;g.DrawString(coaching,font,ink,coachingArea,format);}}
    if(hovered){using(Brush card=new SolidBrush(Color.FromArgb(242,249,248,235)))using(GraphicsPath shape=Rounded(cardArea,14))g.FillPath(card,shape);using(Font font=new Font("Segoe UI",9f,FontStyle.Regular))using(Brush text=new SolidBrush(Color.FromArgb(255,57,78,48))){StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;format.LineAlignment=StringAlignment.Center;format.Trimming=StringTrimming.EllipsisWord;g.DrawString(step,font,text,new RectangleF(16,194,308,40),format);DrawButton(g,doneArea,"Done",font,text);DrawButton(g,talkArea,"Talk",font,text);DrawButton(g,openArea,"Open",font,text);using(Font voiceFont=new Font("Segoe UI",7f,FontStyle.Regular))DrawButton(g,voiceArea,voiceEnabled?"AI voice: on":"AI voice: off",voiceFont,text);DrawButton(g,closeArea,"Close",font,text);}}
   }
   IntPtr screenDc=GetDC(IntPtr.Zero),memoryDc=CreateCompatibleDC(screenDc),bitmap=frame.GetHbitmap(Color.FromArgb(0)),old=SelectObject(memoryDc,bitmap);
   try{POINT destination=new POINT(Left,Top),source=new POINT(0,0);SIZE size=new SIZE(Width,Height);BLENDFUNCTION blend=new BLENDFUNCTION();blend.BlendOp=AC_SRC_OVER;blend.SourceConstantAlpha=255;blend.AlphaFormat=AC_SRC_ALPHA;if(!UpdateLayeredWindow(Handle,screenDc,ref destination,ref size,memoryDc,ref source,0,ref blend,ULW_ALPHA))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());if(!previewSaved&&sprite!=null&&workbench!=null){frame.Save(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-pet-preview.png"),ImageFormat.Png);File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-pet-status.json"),new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"visible",Visible},{"topMost",TopMost},{"width",Width},{"height",Height},{"alphaWindow",true},{"workbench",true},{"actors",1}}));previewSaved=true;}}finally{SelectObject(memoryDc,old);DeleteObject(bitmap);DeleteDC(memoryDc);ReleaseDC(IntPtr.Zero,screenDc);if(canvas!=null)canvas.Dispose();canvas=frame;}
  }
  static void DrawButton(Graphics g,Rectangle box,string label,Font font,Brush text){using(Brush fill=new SolidBrush(Color.FromArgb(245,239,243,225)))using(GraphicsPath rounded=Rounded(box,10))g.FillPath(fill,rounded);StringFormat format=new StringFormat();format.Alignment=StringAlignment.Center;format.LineAlignment=StringAlignment.Center;g.DrawString(label,font,text,box,format);}
  public static void Log(Exception error){try{File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-pet.log"),DateTime.UtcNow.ToString("o")+" "+error.GetType().Name+": "+error.Message+Environment.NewLine);}catch{}}
 }
 public static class Program {
  [STAThread] public static void Main(string[] args){bool created;using(Mutex mutex=new Mutex(true,"Local\\DaytownNativePet",out created)){if(!created)return;try{Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new PetWindow(args.Length>0?args[0]:"http://localhost:3000",args.Length>1&&args[1]=="--walk"));}catch(Exception error){PetWindow.Log(error);}}}
 }
}
