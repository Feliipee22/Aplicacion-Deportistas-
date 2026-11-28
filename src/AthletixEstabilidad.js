import React, {useEffect,useState} from 'react';
export class LimiteErrores extends React.Component {
  state = {error:false};
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error ? <main style={{padding:24,maxWidth:480,margin:'auto'}}><h2>No pudimos cargar Athletix</h2><p>Intenta abrir la aplicación nuevamente.</p><button onClick={()=>window.location.reload()}>Reintentar</button></main> : this.props.children;}
}
export function AvisoConexion(){
  const [online,setOnline]=useState(navigator.onLine);
  useEffect(()=>{const cambiar=()=>setOnline(navigator.onLine);window.addEventListener('online',cambiar);window.addEventListener('offline',cambiar);return()=>{window.removeEventListener('online',cambiar);window.removeEventListener('offline',cambiar);};},[]);
  return online ? null : <div role="status" style={{position:'fixed',bottom:'calc(76px + env(safe-area-inset-bottom, 0px))',left:'50%',transform:'translateX(-50%)',zIndex:9999,background:'#152637',color:'white',padding:'10px 16px',borderRadius:12,maxWidth:'90vw',pointerEvents:'none'}}>Sin conexión a internet. Algunas funciones no están disponibles.</div>;
}
