const response=await fetch('http://localhost:3000/api/debug',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'seed'})});
if(!response.ok)throw new Error('Start Daytown with npm start, then run npm run seed.');
const {state}=await response.json();console.log(`Seeded ${state.tasks.length} fictional tasks. Existing graves were preserved.`);
