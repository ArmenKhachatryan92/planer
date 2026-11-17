const $ = (id) => document.getElementById(id);
const STORE = "planer.tasks.v1";
let tasks = JSON.parse(localStorage.getItem(STORE) || "[]");
let editingId = null;
const today = new Date().toISOString().slice(0,10);
$("taskDate").value = today;

function persist(){ localStorage.setItem(STORE, JSON.stringify(tasks)); render(); }
function render(){
  const date = $("taskDate").value;
  const list = tasks.filter(t => t.date === date).sort((a,b)=>a.done-b.done);
  $("tasks").innerHTML = "";
  if(!list.length){ $("tasks").innerHTML = '<p class="muted">На эту дату задач пока нет.</p>'; return; }
  list.forEach(t=>{
    const row=document.createElement("div"); row.className="task"+(t.done?" done":"");
    const check=document.createElement("input"); check.type="checkbox"; check.checked=t.done;
    check.addEventListener("change",()=>{t.done=check.checked;persist();});
    const title=document.createElement("div"); title.className="task-title"; title.textContent=t.title;
    const meta=document.createElement("div"); meta.className="muted"; meta.textContent=t.priority+(t.note?" · "+t.note:"");
    const del=document.createElement("button"); del.className="delete"; del.textContent="Удалить";
    del.addEventListener("click",()=>{tasks=tasks.filter(x=>x.id!==t.id);persist();});
    row.append(check,title,meta,del); $("tasks").append(row);
  });
}
function openForm(){ editingId=null; $("taskTitle").value=""; $("taskNote").value=""; $("taskPriority").value="Средний"; $("entry").hidden=false; $("taskTitle").focus(); }
$("addTask").addEventListener("click",openForm);
$("cancelTask").addEventListener("click",()=>$("entry").hidden=true);
$("saveTask").addEventListener("click",()=>{
  const title=$("taskTitle").value.trim(); if(!title){alert("Введите название задачи");return;}
  tasks.push({id:crypto.randomUUID(),title,note:$("taskNote").value.trim(),priority:$("taskPriority").value,date:$("taskDate").value,done:false,createdAt:new Date().toISOString()});
  persist(); $("entry").hidden=true;
});
$("taskDate").addEventListener("change",render);
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();
