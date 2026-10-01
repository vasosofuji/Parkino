import { leafletScript, leafletStyles } from "../vendor/leaflet";
const tileUrl =
  process.env.EXPO_PUBLIC_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const mapHtml = `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${leafletStyles}html,body,#map{height:100%;width:100%;margin:0}.leaflet-container{touch-action:none}.leaflet-bottom{bottom:2px}.leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.85)!important}.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.72) saturate(.65)}.dark.leaflet-container{background:#281f1b}</style>
<style>
.parking-pin span{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:2px solid #fff;border-radius:50%;color:#fff;font:800 12px system-ui;box-shadow:0 2px 5px #173d3a35}
.parking-pin.cluster span{width:26px;height:26px;background:#f4e8d4!important;color:#392c25;border-color:#947459}
.parking-pin.selected span{outline:3px solid #d9a48d;transform:scale(1.2)}
.parking-pin.spaces span{width:42px;height:30px;background:#07874f!important;border:3px solid #b5f5d0;box-shadow:0 0 0 4px #26c77930;font-size:13px;transform:translate(-9px,-3px)}
.zone-vertex{display:flex;align-items:center;justify-content:center}.zone-vertex span{width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#962e2b;box-shadow:0 1px 5px #392c2570}
.destination-pin span{display:block;width:28px;height:28px;border:3px solid #fff;border-radius:50% 50% 50% 0;background:#ce383e;transform:rotate(-45deg);box-shadow:-2px 2px 7px #50202050}.destination-pin span::after{content:'';display:block;width:9px;height:9px;border-radius:50%;background:#fff;margin:9px}
.destination-label{border:none;border-radius:8px;color:#8e1822;padding:6px 10px;max-width:210px;overflow:hidden;text-overflow:ellipsis;font:700 12px system-ui;box-shadow:0 2px 8px #50202025}
</style></head><body><div id="map" aria-label="Skopje parking map"></div>
<script>${leafletScript}</script><script>
(function(){
const send = (message) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
const map = L.map('map',{zoomControl:false,attributionControl:false,minZoom:3}).setView([41.9961,21.4316],15);
L.tileLayer(${JSON.stringify(tileUrl)},{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const group = L.layerGroup().addTo(map);
let current = null;
let destinationKey = '';
let dragging = false, pending = null;
map.on('dragstart',()=>send({type:'pan'}));
map.on('movestart',()=>send({type:'position',point:null}));
function position(){if(current && current.selectedId && current.selectedAnchor){const p=map.latLngToContainerPoint(current.selectedAnchor);send({type:'position',point:{x:p.x,y:p.y}});}else send({type:'position',point:null});}
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
    L.marker(zone.point,{icon:L.divIcon({className:'zone-label',html:label,iconSize:[50,26]}),title:zone.title}).on('click',()=>select(zone.id,{lat:zone.point[0],lng:zone.point[1]})).addTo(group);
  });
  next.pins.forEach(pin=>{
    const span = document.createElement('span');
    span.textContent=pin.spaces?'P ✓':pin.label;
    span.style.background=pin.color;
    const icon=L.divIcon({className:'parking-pin'+(pin.selected?' selected':'')+(pin.cluster?' cluster':'')+(pin.spaces?' spaces':''),html:span,iconSize:[26,26],iconAnchor:[13,13]});
    const marker=L.marker(pin.point,{icon,title:pin.title,zIndexOffset:pin.selected?1000:pin.spaces?800:0});
    marker.on('click',()=>{
      if(next.selectionEnabled===false&&!next.picking)return;
      if(!next.picking && pin.cluster)map.setView(pin.point,Math.min(19,map.getZoom()+1),{animate:false});
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
    L.marker(next.destinationMarker,{zIndexOffset:2000,title:next.destinationName,icon:L.divIcon({className:'destination-pin',html:'<span></span>',iconSize:[34,44],iconAnchor:[17,44]})}).bindTooltip(label,{permanent:true,direction:'top',offset:[0,-44],className:'destination-label'}).addTo(group);
  }
  if(next.userLocation){
    if(next.userAccuracy)L.circle(next.userLocation,{radius:next.userAccuracy,color:'#3977D5',weight:1,fillOpacity:.08,interactive:false}).addTo(group);
    L.circleMarker(next.userLocation,{radius:7,fillColor:'#3977D5',color:'#fff',weight:3,fillOpacity:1,interactive:false}).addTo(group);
  }
  const key=next.destination.join(',')+':'+(next.cameraRevision||0);
  if(key!==destinationKey){destinationKey=key;map.setView(next.destination,15,{animate:false});}
  map.invalidateSize();
  position();
};
window.addEventListener('resize',()=>map.invalidateSize());
send({type:'ready'});
})();
</script></body></html>`;
