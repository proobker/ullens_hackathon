const token=process.env.RFID_DEVICE_TOKEN;
if(!token)throw new Error('Set RFID_DEVICE_TOKEN to the provisioned reader credential.');
const response=await fetch((process.env.API_ORIGIN??'http://127.0.0.1:4100')+'/api/platform/rfid/scans',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({version:1,deviceId:process.env.RFID_DEVICE_ID??'reader-demo',eventId:crypto.randomUUID(),tagUid:process.argv[2]??'DEADBEEF'})
});
console.log('SIMULATED RFID event',response.status,await response.text());
if(!response.ok)process.exitCode=1;
