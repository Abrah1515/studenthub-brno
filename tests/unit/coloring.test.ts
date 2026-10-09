import { describe,expect,it } from "vitest";
import { colorSchema,completion,drawingSchema,emptyDrawing,historyChange,historyRedo,historyUndo,reconcileDrawing,regionAt,simplifyPoints,type SavedDrawing } from "@/lib/coloring";
describe("omalovánky",()=>{
 it("serializuje a validuje kresbu",()=>{const d={...emptyDrawing(),colors:{1:'#abcdef'}};expect(drawingSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);});
 it("čte ID regionu a chrání hranice",()=>{const mask=new Uint8ClampedArray([1,2,0,255,0,0,0,255]);expect(regionAt(mask,2,1,0,0)).toBe(513);expect(regionAt(mask,2,1,-1,0)).toBe(0);expect(regionAt(mask,2,1,2,0)).toBe(0);});
 it("vrátí zpět a znovu bez mutace",()=>{const a=emptyDrawing(),b={...a,colors:{1:'#ffffff'}},h=historyChange({past:[],present:a,future:[]},b);expect(historyUndo(h).present).toEqual(a);expect(historyRedo(historyUndo(h)).present).toEqual(b);expect(a.colors).toEqual({});});
 it("omezuje historii na30",()=>{let h={past:[],present:emptyDrawing(),future:[]} as Parameters<typeof historyChange>[0];for(let i=0;i<50;i++)h=historyChange(h,emptyDrawing());expect(h.past).toHaveLength(30);});
 it("počítá plochu a ignoruje bílou",()=>{const regions=[{id:1,area:30,x:1,y:1},{id:2,area:70,x:2,y:2}];expect(completion({...emptyDrawing(),colors:{1:'#abcdef',2:'#ffffff'}},regions)).toBe(30);expect(completion({...emptyDrawing(),completed:true},regions)).toBe(100);});
 it("zjednoduší tah a zachová konce",()=>{const pts=[[0,0,.5],[.0001,0,.5],[.5,.5,1],[1,1,.5]] as [number,number,number][];expect(simplifyPoints(pts)).toEqual([pts[0],pts[2],pts[3]]);});
 it("odmítá nebezpečné barvy",()=>{for(const v of ['red','url(foo)','#123','<script>'])expect(colorSchema.safeParse(v).success).toBe(false);});
 it("odmítá přebytečná data a mimořádné tahy",()=>{expect(drawingSchema.safeParse({...emptyDrawing(),user_id:'another'}).success).toBe(false);expect(drawingSchema.safeParse({...emptyDrawing(),strokes:[{color:'#abcdef',width:71,erase:false,points:[[0,0,.5]]}]}).success).toBe(false);expect(drawingSchema.safeParse({...emptyDrawing(),strokes:Array(301).fill({color:'#abcdef',width:1,erase:false,points:[[0,0,.5]]})}).success).toBe(false);});
 it("nepřepíše lokální neodeslanou kresbu jinou revizí",()=>{const local:SavedDrawing={drawing:emptyDrawing(),revision:1,dirty:true,updatedAt:'2026-10-10'},cloud={...local,revision:2,dirty:false};expect(reconcileDrawing(local,cloud)).toEqual({value:local,conflict:true});expect(reconcileDrawing({...local,dirty:false},cloud).value).toEqual(cloud);});
});
