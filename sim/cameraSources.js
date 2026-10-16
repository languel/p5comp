export async function listCameras(mediaDevices) {
  if (!mediaDevices?.enumerateDevices) return [];
  return (await mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').map((d,i)=>({id:d.deviceId,label:d.label||`Camera ${i+1}`}));
}
export function cameraConstraints(deviceId) {
  return {video:deviceId?{deviceId:{exact:deviceId}}:true,audio:false};
}
