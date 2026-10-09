const { contextBridge, ipcRenderer } = require('electron');
const OK = ['app:info','store:get','store:set','state:push','displays','output:open','output:close','fonts:list',
  'import:logo','import:bg','asset:remove','theme:export','theme:import','api','open:external'];
contextBridge.exposeInMainWorld('stage', {
  invoke: (ch, ...a) => OK.includes(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('blocked')),
  on: (ch, fn) => { if (ch === 'output:closed') ipcRenderer.on(ch, () => fn()); }
});
