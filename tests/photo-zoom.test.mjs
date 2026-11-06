import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomState } from '../src/lib/photo-zoom.mjs';
const viewport={width:600,height:400}, photo={width:600,height:400};
test('zoom is bounded, preserves the cursor anchor and clamps panning',()=>{
 const state={scale:1,x:0,y:0};
 assert.deepEqual(zoomState(state,2,{x:50,y:20},viewport,photo),{scale:2,x:-50,y:-20});
 assert.equal(zoomState(state,10,{x:0,y:0},viewport,photo).scale,4);
 assert.deepEqual(zoomState({scale:4,x:500,y:300},0,{x:0,y:0},viewport,photo),state);
 assert.deepEqual(zoomState({scale:2,x:999,y:-999},2,{x:0,y:0},viewport,photo),{scale:2,x:300,y:-200});
 assert.deepEqual(zoomState(state,2,{x:200,y:50},viewport,{width:100,height:400}),{scale:2,x:0,y:-50});
});
