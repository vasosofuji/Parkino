import { leafletScript, leafletStyles } from "../vendor/leaflet";
const tileUrl =
  process.env.EXPO_PUBLIC_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const mapHtml = `<!doctype html><html><head>
<title>Parkino parking map</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${leafletStyles}html,body,#map{height:100%;width:100%;margin:0}.leaflet-container{touch-action:none}.leaflet-bottom{bottom:2px}.leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.85)!important}.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.72) saturate(.65)}.dark.leaflet-container{background:#281f1b}</style>
<style>
.parking-pin{display:flex;align-items:center;justify-content:center;background:transparent;border:0}
.parking-pin-face{position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 5px;border:2px solid #fff;border-radius:16px;color:#fff;font:800 12px system-ui;box-shadow:0 2px 5px #173d3a35}
.parking-pin.selected .parking-pin-face{outline:3px solid #d9a48d;outline-offset:2px}
.parking-pin.spaces .parking-pin-face{min-width:42px;height:30px;box-shadow:0 0 0 3px #26c77930}
.parking-free-badge,.parking-state-badge{position:absolute;right:-7px;top:-8px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #087184;border-radius:9px;background:#fff;color:#07596A;font:800 10px system-ui}
.parking-state-badge{left:-7px;right:auto;top:auto;bottom:-8px;color:#fff;border-color:#fff}
.zone-vertex{display:flex;align-items:center;justify-content:center}.zone-vertex span{width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#962e2b;box-shadow:0 1px 5px #392c2570}
.destination-pin span{display:block;width:28px;height:28px;border:3px solid #fff;border-radius:50% 50% 50% 0;background:#ce383e;transform:rotate(-45deg);box-shadow:-2px 2px 7px #50202050}.destination-pin span::after{content:'';display:block;width:9px;height:9px;border-radius:50%;background:#fff;margin:9px}
.destination-label{border:none;border-radius:8px;color:#8e1822;padding:6px 10px;max-width:210px;overflow:hidden;text-overflow:ellipsis;font:700 12px system-ui;box-shadow:0 2px 8px #50202025}
</style></head><body><div id="map" aria-label="Skopje parking map"></div>
<script>${leafletScript}</script><script>
(function(){
const send = (message) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({...message,sentAt:Date.now()}));
const map = L.map('map',{zoomControl:false,attributionControl:false,minZoom:3}).setView([41.9961,21.4316],15);
L.tileLayer(${JSON.stringify(tileUrl)},{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const group = L.layerGroup().addTo(map);
let userDot = null, userAccuracy = null;
window.updateUserLocation = function(point,accuracy) {
  if(!point){if(userDot){userDot.remove();userDot=null;}if(userAccuracy){userAccuracy.remove();userAccuracy=null;}return;}
  if(userDot)userDot.setLatLng(point);
  else userDot=L.circleMarker(point,{radius:7,fillColor:'#3977D5',color:'#fff',weight:3,fillOpacity:1,interactive:false}).addTo(map);
  if(accuracy>0){
    if(userAccuracy)userAccuracy.setLatLng(point).setRadius(accuracy);
    else userAccuracy=L.circle(point,{radius:accuracy,color:'#3977D5',weight:1,fillOpacity:.08,interactive:false}).addTo(map);
  }else if(userAccuracy){userAccuracy.remove();userAccuracy=null;}
  userDot.bringToFront();
};
let current = null;
let destinationKey = '';
let dragging = false, pending = null;
map.on('dragstart',()=>send({type:'pan'}));
map.on('movestart',()=>send({type:'position',selectionId:current?.selectedId??null,anchor:current?.selectedAnchor??null,point:null}));
function position(){if(current && current.selectedId && current.selectedAnchor){const p=map.latLngToContainerPoint(current.selectedAnchor);send({type:'position',selectionId:current.selectedId,anchor:current.selectedAnchor,point:{x:p.x,y:p.y}});}else send({type:'position',selectionId:null,anchor:null,point:null});}
map.on('moveend',()=>{const p=map.getCenter();send({type:'center',latitude:p.lat,longitude:p.lng});position();});
map.on('zoomend',()=>send({type:'zoom',zoom:map.getZoom()}));
map.on('click',event=>{if(current && current.picking)send({type:'pick',latitude:event.latlng.lat,longitude:event.latlng.lng});else send({type:'blank'});});
function select(id,latlng) {
  if(current.picking)send({type:'pick',latitude:latlng.lat,longitude:latlng.lng});
  else if(current.selectionEnabled!==false)send({type:'select',id,latitude:latlng.lat,longitude:latlng.lng});
}
window.renderParking = function(next) {
  if(dragging){pending=next;return;}
  current = next;
  document.getElementById("map").classList.toggle("dark",Boolean(next.dark));
  const oldLayers=group.getLayers();
  group.clearLayers();
  oldLayers.forEach(layer=>layer.off());
  (next.footprints || []).forEach(area=>{
    if(!area.selected && !map.getBounds().intersects(L.latLngBounds(area.rings[0])))return;
    L.polygon(area.rings,{color:'#962E2B',weight:area.selected?2.5:1.5,fillOpacity:area.selected?.12:.045})
      .on('click',event=>{L.DomEvent.stopPropagation(event);select(area.id,event.latlng);}).addTo(group);
  });
  next.zones.forEach(zone=>{
    const polygon = L.polygon(zone.rings,{color:'#527FBA',weight:1,dashArray:'5 5',fillOpacity:0.035});
    polygon.on('click',event=>{L.DomEvent.stopPropagation(event);select(zone.id,event.latlng);});
    polygon.addTo(group);
  });
  (next.zoneLabels || []).forEach(zone=>{
    const label=document.createElement('span');label.textContent=zone.label;
    label.style.cssText='background:#fff;color:#392c25;border:1px '+(zone.approximate?'dashed':'solid')+' #527FBA;border-radius:6px;padding:3px 6px;font:600 12px system-ui;white-space:nowrap';
    L.marker(zone.point,{autoPanOnFocus:false,icon:L.divIcon({className:'zone-label',html:label,iconSize:[50,26]}),title:zone.title}).on('click',()=>select(zone.id,{lat:zone.point[0],lng:zone.point[1]})).addTo(group);
  });
  next.pins.forEach(pin=>{
    const icon=L.divIcon({className:'parking-pin'+(pin.selected?' selected':'')+(pin.cluster?' cluster':'')+(pin.spaces?' spaces':''),html:pin.html,iconSize:[60,48],iconAnchor:[30,24]});
    const marker=L.marker(pin.point,{autoPanOnFocus:false,icon,title:pin.title,zIndexOffset:pin.selected?1000:pin.spaces?800:0});
    marker.on('click',()=>{
      if(next.selectionEnabled===false&&!next.picking)return;
      if(!next.picking && pin.cluster){send({type:'interaction'});map.setView(pin.point,Math.min(19,map.getZoom()+1),{animate:false});}
      else select(pin.id,{lat:pin.point[0],lng:pin.point[1]});
    });
    marker.addTo(group);
  });
  const draft=next.draft||[];
  const outline=L.polyline(draft,{color:'#962e2b',weight:3,dashArray:'7 5',interactive:false}).addTo(group);
  const polygon=draft.length>2?L.polygon(draft,{color:'#962e2b',weight:1,fillOpacity:.12,interactive:false}).addTo(group):null;
  draft.forEach((p,index)=>{
    const marker=L.marker(p,{draggable:!!next.drawing,autoPan:true,zIndexOffset:3000,title:next.cornerLabel+(index+1),icon:L.divIcon({className:'zone-vertex',html:'<span></span>',iconSize:[44,44],iconAnchor:[22,22]})}).addTo(group);
    marker.on('click',L.DomEvent.stopPropagation);
    marker.on('dragstart',()=>{dragging=true;});
    marker.on('drag',()=>{const point=marker.getLatLng();draft[index]=[point.lat,point.lng];outline.setLatLngs(draft);if(polygon)polygon.setLatLngs(draft);});
    marker.on('dragend',()=>{
      const point=marker.getLatLng();dragging=false;
      if(pending){pending.draft=draft;const queued=pending;pending=null;window.renderParking(queued);}
      send({type:'vertex',index,latitude:point.lat,longitude:point.lng});
    });
  });
  if(next.destinationMarker&&!next.drawing){
    const label=document.createElement('span');label.textContent=next.destinationName;
    L.marker(next.destinationMarker,{zIndexOffset:2000,title:next.destinationName,icon:L.divIcon({className:'destination-pin',html:'<span></span>',iconSize:[34,44],iconAnchor:[17,44]})}).on('click',()=>send({type:'interaction'})).bindTooltip(label,{permanent:true,direction:'top',offset:[0,-44],className:'destination-label'}).addTo(group);
  }
  if(userDot)userDot.bringToFront();
  const key=next.destination.join(',')+':'+(next.cameraRevision||0);
  if(key!==destinationKey){destinationKey=key;map.setView(next.destination,15,{animate:false});}
  position();
};
window.addEventListener('resize',()=>{map.invalidateSize({pan:false});position();});
send({type:'ready'});
})();
</script></body></html>`;
