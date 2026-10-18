import { Link } from 'wouter';
import { ArrowLeft, Compass } from 'lucide-react';
import { AppShell, Eyebrow } from '@/components/shared';

export default function NotFound() {
  return <AppShell><section className="page-enter mx-auto flex min-h-[65dvh] max-w-2xl flex-col items-center justify-center text-center" data-testid="screen-not-found">
    <div className="mb-6 grid h-20 w-20 place-items-center rounded-[28px] bg-[#eee8ff] text-[#7047ff]"><Compass size={30} strokeWidth={1.7}/></div>
    <Eyebrow>Off the map</Eyebrow>
    <p className="display text-[88px] font-extrabold leading-none tracking-[-.08em] text-[#d4c6ff]">404</p>
    <h1 className="display mt-2 text-3xl font-extrabold tracking-[-.05em] text-white">This page wandered off.</h1>
    <p className="mt-3 max-w-md text-sm leading-6 text-[#82778c]">That address doesn’t lead to a CHOG MATE connection. Let’s find our way back.</p>
    <Link href="/" className="button-primary mt-7 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" data-testid="link-home-from-404"><ArrowLeft size={15}/>Back to CHOG MATE</Link>
  </section></AppShell>;
}
