import test from 'node:test';
import assert from 'node:assert/strict';
import {followPanOffset,FOLLOW_INTERVAL_MS} from '../src/lib/running-lab/map-follow.mjs';

test('map follow leaves the useful inner viewport unchanged and pans only beyond an inset',()=>{
 const size={width:600,height:400};for(const point of [{x:300,y:200},{x:100,y:90},{x:500,y:320}])assert.equal(followPanOffset(point,size),null);
 const edge={x:590,y:390},offset=followPanOffset(edge,size);assert.ok(offset.x>0&&offset.y>0);assert.ok(Math.abs(edge.x-offset.x-408)<1e-9);assert.equal(edge.y-offset.y,248);
 assert.equal(followPanOffset({x:edge.x-offset.x,y:edge.y-offset.y},size),null,'the pan creates hysteresis before the next edge');assert.ok(FOLLOW_INTERVAL_MS>=1000);
});

test('map follow handles small mobile maps, big jumps and unavailable geometry without modifying inputs',()=>{
 const point={x:-1200,y:-800},size={width:300,height:260},before=structuredClone({point,size}),offset=followPanOffset(point,size);assert.ok(offset.x<0&&offset.y<0);assert.equal(followPanOffset({x:point.x-offset.x,y:point.y-offset.y},size),null);assert.deepEqual({point,size},before);
 for(const [p,s]of [[{x:NaN,y:20},size],[{x:10,y:Infinity},size],[point,{width:0,height:400}],[point,{width:600,height:0}],[point,null]])assert.equal(followPanOffset(p,s),null);
});
