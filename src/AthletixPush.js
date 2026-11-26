import {useEffect} from 'react';
import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import {supabase} from './supabase';
const KEY='athletix.push.token';
const android=()=>Capacitor.getPlatform()==='android';
let pending=Promise.resolve();
let enabled=false;
export function useAthletixPush(usuarioId){
 useEffect(()=>{
  if(!usuarioId||!android()) return;
  let active=true; enabled=true;
  const handles=[];
  const listen=async(event,fn)=>{const h=await PushNotifications.addListener(event,fn); if(active)handles.push(h);else await h.remove();};
  const start=async()=>{
   await listen('registration',({value})=>{
    if(!active||!enabled)return;
    pending=pending.catch(()=>{}).then(async()=>{
     if(!active||!enabled)return;
     const {data}=await supabase.auth.getUser();
     if(data.user?.id!==usuarioId||!active||!enabled)return;
     const old=localStorage.getItem(KEY);
     if(old&&old!==value){const {error}=await supabase.rpc('ath_desvincular_push',{p_token:old});if(error)throw error;}
     localStorage.setItem(KEY,value);
     const {error}=await supabase.rpc('ath_registrar_push',{p_token:value});if(error)throw error;
    });pending.catch(e=>console.warn('Athletix push: registro fallido',e.message));
   });
   await listen('registrationError',()=>console.warn('Athletix push: error de Firebase'));
   if(!active)return;
   let p=await PushNotifications.checkPermissions();
   if(p.receive==='prompt'||p.receive==='prompt-with-rationale')p=await PushNotifications.requestPermissions();
   if(active&&enabled&&p.receive==='granted')await PushNotifications.register();
  };
  start().catch(e=>console.warn('Athletix push:',e.message));
  return()=>{active=false;enabled=false;handles.forEach(h=>h.remove());};
 },[usuarioId]);
}
export async function desvincularAthletixPush(){
 if(!android())return;
 enabled=false;
 await pending.catch(()=>{});
 const token=localStorage.getItem(KEY);
 if(token){const {error}=await supabase.rpc('ath_desvincular_push',{p_token:token});if(error)throw error;}
 await PushNotifications.unregister();
 localStorage.removeItem(KEY);
}
