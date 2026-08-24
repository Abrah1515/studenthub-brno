"use client";

import { CheckCircle2, Globe2, KeyRound, Loader2, LogIn, MailPlus, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

type Mode="login"|"signup"|"recover";
type Completion={kind:"signup"|"recover";message:string}|null;

export function UserLoginForm({next="/nastaveni",description="Pro tuto akci je potřeba účet s ověřeným e-mailem.",compact=false}:{next?:string;description?:string;compact?:boolean}){
  const [mode,setMode]=useState<Mode>("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [pending,setPending]=useState(false);
  const [completion,setCompletion]=useState<Completion>(null);
  const [error,setError]=useState("");
  const [googleEnabled,setGoogleEnabled]=useState(false);
  const [resendPending,setResendPending]=useState(false);
  const [resendMessage,setResendMessage]=useState("");
  const [resendError,setResendError]=useState("");
  const [cooldown,setCooldown]=useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/auth/providers",{cache:"no-store",signal:controller.signal})
      .then((response)=>response.ok?response.json():null)
      .then((value)=>setGoogleEnabled(Boolean(value?.google)))
      .catch(()=>undefined);
    return ()=>controller.abort();
  },[]);

  useEffect(()=>{
    if(cooldown<=0)return;
    const timer=window.setTimeout(()=>setCooldown((value)=>Math.max(0,value-1)),1000);
    return ()=>window.clearTimeout(timer);
  },[cooldown]);

  function switchMode(value:Mode){
    setMode(value);
    setError("");
    setCompletion(null);
    setResendMessage("");
    setResendError("");
  }

  async function submit(event:React.FormEvent){
    event.preventDefault();
    setPending(true);
    setError("");
    setCompletion(null);
    try{
      const endpoint=mode==="signup"?"/api/auth/signup":mode==="recover"?"/api/auth/recover":"/api/auth/password";
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,...(mode==="recover"?{}:{password}),next})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok){setError(result.message||"Akci se nepodařilo dokončit.");return;}
      if(mode==="login"||result.requiresEmailConfirmation===false){window.location.assign(result.next||next);return;}
      if(mode==="signup")setCooldown(60);
      setCompletion({kind:mode,message:result.message});
    }catch{
      setError("Síťové připojení selhalo. Zkuste to prosím znovu.");
    }finally{
      setPending(false);
    }
  }

  async function google(){
    setPending(true);
    setError("");
    try{
      const response=await fetch("/api/auth/google",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({next})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.url){setError(result.message||"Google přihlášení se nepodařilo spustit.");return;}
      window.location.assign(result.url);
    }catch{
      setError("Google přihlášení se nepodařilo spustit kvůli síťové chybě.");
    }finally{
      setPending(false);
    }
  }

  async function resend(){
    if(cooldown>0||resendPending)return;
    setResendPending(true);
    setResendError("");
    setResendMessage("");
    try{
      const response=await fetch("/api/auth/resend",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,next})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok){setResendError(result.message||"Nový potvrzovací e-mail se nepodařilo vyžádat.");return;}
      setResendMessage(result.message);
      setCooldown(Math.max(60,Number(result.retryAfterSeconds)||0));
    }catch{
      setResendError("Požadavek se nepodařilo odeslat kvůli síťové chybě.");
    }finally{
      setResendPending(false);
    }
  }

  if(completion?.kind==="signup")return <section className="success-state auth-confirmation-state" aria-labelledby="auth-confirmation-title">
    <CheckCircle2 size={34}/>
    <h2 id="auth-confirmation-title">Účet čeká na potvrzení</h2>
    <p role="status">{completion.message}</p>
    <p>Potvrzení bylo vyžádáno pro <strong>{email}</strong>.</p>
    <div className="auth-email-tips"><strong>E-mail nevidíte?</strong><span>Zkontrolujte složky Spam, Hromadné a Promo. Doručení může několik minut trvat.</span></div>
    {resendMessage&&<p className="success-message" role="status">{resendMessage}</p>}
    {resendError&&<p className="field-error" role="alert">{resendError}</p>}
    <div className="auth-confirmation-actions">
      <button className="button button-primary" type="button" onClick={resend} disabled={resendPending||cooldown>0}>
        {resendPending?<Loader2 className="spin" size={17}/>:<RotateCw size={17}/>} {resendPending?"Odesílám…":cooldown>0?`Poslat znovu za ${cooldown} s`:"Poslat potvrzovací e-mail znovu"}
      </button>
      <button className="button button-secondary" type="button" onClick={()=>{setCompletion(null);setMode("signup");setPassword("");}}>Změnit e-mailovou adresu</button>
      <button className="text-link" type="button" onClick={()=>{setCompletion(null);setMode("login");setPassword("");}}>Zpět k přihlášení</button>
    </div>
  </section>;

  if(completion?.kind==="recover")return <section className="success-state auth-confirmation-state" aria-labelledby="auth-recovery-title">
    <CheckCircle2 size={34}/><h2 id="auth-recovery-title">Zkontrolujte e-mail</h2><p role="status">{completion.message}</p><p>Pokud zprávu nevidíte, zkontrolujte také Spam, Hromadné a Promo.</p><button className="button button-secondary" type="button" onClick={()=>switchMode("login")}>Zpět k přihlášení</button>
  </section>;

  return <form className={`form-card auth-card${compact?" auth-card-compact":""}`} onSubmit={submit} noValidate>
    <h2>{mode==="signup"?"Vytvořit účet e-mailem":mode==="recover"?"Obnovit heslo":"Přihlásit se e-mailem"}</h2>
    <p>{description} Heslo spravuje výhradně Supabase Auth.</p>
    {googleEnabled&&mode!=="recover"&&<><button type="button" className="button button-google" onClick={google} disabled={pending}><Globe2 size={17}/>Pokračovat přes Google</button><div className="auth-divider" aria-hidden="true"><span>nebo</span></div></>}
    <div className="auth-mode-switch" role="group" aria-label="Způsob přihlášení">
      <button type="button" className={mode==="signup"?"active":""} onClick={()=>switchMode("signup")}><MailPlus size={15}/>Vytvořit účet e-mailem</button>
      <button type="button" className={mode==="login"?"active":""} onClick={()=>switchMode("login")}><LogIn size={15}/>Přihlásit se e-mailem</button>
    </div>
    <label><span>E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)}/></label>
    {mode!=="recover"&&<label><span>Heslo</span><input type="password" required minLength={mode==="signup"?10:1} maxLength={128} autoComplete={mode==="signup"?"new-password":"current-password"} value={password} onChange={(event)=>setPassword(event.target.value)}/>{mode==="signup"&&<small>Nejméně 10 znaků, alespoň jedno písmeno a číslo.</small>}</label>}
    {error&&<p className="field-error" role="alert">{error}</p>}
    <button className="button button-primary" disabled={pending}>{mode==="signup"?<MailPlus size={17}/>:mode==="recover"?<KeyRound size={17}/>:<LogIn size={17}/>} {pending?"Pracuji…":mode==="signup"?"Vytvořit účet e-mailem":mode==="recover"?"Poslat obnovovací odkaz":"Přihlásit se e-mailem"}</button>
    <button type="button" className="text-link" onClick={()=>switchMode(mode==="recover"?"login":"recover")}>{mode==="recover"?"Zpět k přihlášení":"Zapomenuté heslo?"}</button>
  </form>;
}
