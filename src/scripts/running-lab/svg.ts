export function svgNode<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string|number>={}):SVGElementTagNameMap[K]{
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));
 return node;
}
export function svgLabel(svg:Element,x:number,y:number,text:string,anchor='start'){
 const node=svgNode('text',{x,y,'text-anchor':anchor});node.textContent=text;svg.append(node);return node;
}
export function localPointer(svg:SVGSVGElement,event:PointerEvent){
 const matrix=svg.getScreenCTM();return matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()):new DOMPoint();
}
let sequence=0;
export const chartId=()=>`lab-plot-${++sequence}`;
export const fontScale=()=>Math.max(1,Math.min(2.5,parseFloat(getComputedStyle(document.documentElement).fontSize)/16));
