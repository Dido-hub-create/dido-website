import {el} from './dom';

// A small non-modal disclosure: no layout contribution, scroll lock or map
// reinitialization. Works without popover/anchor-positioning browser support.
export class AnchoredPanel {
 readonly node=el('section',undefined,'lab-floating-panel');readonly body=el('div',undefined,'lab-floating-body');
 private closeButton=el('button','×','lab-panel-close');private trigger:HTMLButtonElement|null=null;private anchor:HTMLElement|null=null;private boundary:HTMLElement|undefined;private frame=0;
 constructor(host:HTMLElement,id:string,title:string){
  this.node.id=id;this.node.hidden=true;this.node.setAttribute('role','dialog');this.node.setAttribute('aria-modal','false');
  const heading=el('h4',title),head=el('div',undefined,'lab-panel-heading');heading.id=id+'-title';this.node.setAttribute('aria-labelledby',heading.id);
  this.closeButton.type='button';this.closeButton.setAttribute('aria-label','Затвори: '+title);this.closeButton.dataset.labPanelClose='';head.append(heading,this.closeButton);this.node.append(head,this.body);host.append(this.node);
  this.closeButton.addEventListener('click',()=>this.close());document.addEventListener('pointerdown',this.outside);document.addEventListener('keydown',this.key);document.addEventListener('focusin',this.focus);
  window.addEventListener('resize',this.schedule);window.addEventListener('scroll',this.schedule,{capture:true,passive:true});
 }
 prepare(trigger:HTMLButtonElement){trigger.type='button';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',this.node.id);trigger.setAttribute('aria-expanded','false');}
 toggle(trigger:HTMLButtonElement,boundary?:HTMLElement){if(!this.node.hidden&&this.trigger===trigger)this.close();else this.open(trigger,trigger,boundary);}
 open(trigger:HTMLButtonElement,anchor:HTMLElement=trigger,boundary?:HTMLElement){
  if(this.trigger)this.trigger.setAttribute('aria-expanded','false');this.trigger=trigger;this.anchor=anchor;this.boundary=boundary;this.node.hidden=false;trigger.setAttribute('aria-expanded','true');this.place();if(!this.node.hidden)this.closeButton.focus({preventScroll:true});
 }
 close(restore=true){if(this.node.hidden)return;this.node.hidden=true;cancelAnimationFrame(this.frame);this.frame=0;this.trigger?.setAttribute('aria-expanded','false');if(restore){const target=this.trigger?.getClientRects().length?this.trigger:this.anchor;target?.focus({preventScroll:true});}}
 private outside=(event:PointerEvent)=>{const target=event.target as Node;if(!this.node.hidden&&!this.node.contains(target)&&!this.trigger?.contains(target)&&!this.anchor?.contains(target))this.close(false);};
 private key=(event:KeyboardEvent)=>{if(!this.node.hidden&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();this.close();}};
 private focus=(event:FocusEvent)=>{const target=event.target as Node;if(!this.node.hidden&&!this.node.contains(target)&&!this.trigger?.contains(target))this.close(false);};
 private schedule=()=>{if(!this.node.hidden&&!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.place();});};
 private place(){
  if(!this.anchor)return;
  if(this.boundary&&this.boundary.getBoundingClientRect().height>=140){
   const r=this.boundary.getBoundingClientRect(),top=Math.max(8,r.top+8),bottom=Math.min(innerHeight-8,r.bottom-64),width=Math.max(1,Math.min(430,r.width-80,innerWidth-16));
   if(bottom-top<100){this.close(false);return;}
   this.node.style.width=width+'px';this.node.style.maxHeight=Math.min(540,bottom-top)+'px';this.node.style.left=Math.max(8,Math.min(r.right-width-8,innerWidth-width-8))+'px';this.node.style.top=top+'px';return;
  }
  this.node.style.width='';const r=this.anchor.getBoundingClientRect(),gap=8,below=innerHeight-r.bottom-gap*2,above=r.top-gap*2,up=below<220&&above>below;
  this.node.style.maxHeight=Math.max(1,Math.min(540,innerHeight-gap*2,up?above:below))+'px';
  const box=this.node.getBoundingClientRect(),left=Math.max(gap,Math.min(r.left,innerWidth-box.width-gap)),top=Math.max(gap,Math.min(up?r.top-box.height-gap:r.bottom+gap,innerHeight-box.height-gap));
  this.node.style.left=left+'px';this.node.style.top=top+'px';
 }
 destroy(){this.close(false);this.node.remove();document.removeEventListener('pointerdown',this.outside);document.removeEventListener('keydown',this.key);document.removeEventListener('focusin',this.focus);window.removeEventListener('resize',this.schedule);window.removeEventListener('scroll',this.schedule,true);}
}
