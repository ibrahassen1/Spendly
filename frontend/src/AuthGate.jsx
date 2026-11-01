import { SignIn, UserButton, useAuth } from '@clerk/react';
import AccountDashboard from './AccountDashboard.jsx';

export default function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) return <main style={{padding:40}}>Loading Spendly…</main>;
  if (!isSignedIn) return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#07131b',color:'white'}}><section><h1>Spendly</h1><p>Sign in to your money dashboard.</p><SignIn routing="hash" fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" /></section></main>;
  return <><div style={{position:'fixed',right:20,top:16,zIndex:10}}><UserButton /></div><AccountDashboard getToken={getToken}/></>;
}
