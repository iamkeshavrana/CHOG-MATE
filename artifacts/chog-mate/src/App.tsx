import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import HomePage from '@/pages/home';
import { DiscoverPage, MatchesPage, MessagesPage } from '@/pages/social';
import { MyChogPage, ProfilePage, SettingsPage } from '@/pages/identity';
import {
  getGetAuthSessionQueryKey,
  getGetMeQueryKey,
  useGetAuthSession,
} from '@workspace/api-client-react';
import { AppShell, EmptyState, PageTitle } from '@/components/shared';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';
import { supabase } from '@/lib/supabase';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/matches">
          <RequireSession><MatchesPage /></RequireSession>
        </Route>
        <Route path="/messages">
          <RequireSession><MessagesPage /></RequireSession>
        </Route>
        <Route path="/my-chog">
          <RequireSession><MyChogPage /></RequireSession>
        </Route>
        <Route path="/profile">
          <RequireSession><ProfilePage /></RequireSession>
        </Route>
        <Route path="/settings">
          <RequireSession><SettingsPage /></RequireSession>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const session = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
      staleTime: 0,
    },
  });
  const returnTo = `${path}${window.location.search}${window.location.hash}`;

  if (session.isPending) {
    return <AppShell><div className="skeleton h-72 rounded-[28px]" role="status" aria-label="Checking your CHOG MATE session" /></AppShell>;
  }

  if (session.isError) {
    return <AppShell>
      <div className="surface mx-auto max-w-2xl rounded-[28px] px-6 py-12 text-center">
        <PageTitle eyebrow="Private account area" title="We couldn’t check your session." description="Your private account pages stay closed until CHOG MATE can confirm your session." />
        <button type="button" onClick={() => void session.refetch()} className="button-primary rounded-full px-5 py-3 text-sm font-bold" data-testid="button-retry-session-check">Try again</button>
      </div>
    </AppShell>;
  }

  if (!session.data?.authenticated) {
    return <AppShell>
      <div className="page-enter mx-auto max-w-2xl">
        <PageTitle eyebrow="A private account area" title="Connect to continue." description="Create or restore a CHOG MATE account to view this private page. Home and Discover remain open to everyone." />
        <EmptyState
          title="Connect your wallet or create an account."
          detail="You can sign in with a connected wallet or create an address-only social account after Chog ownership is verified."
          action={<button type="button" onClick={() => setWalletDialogOpen(true)} className="button-primary rounded-full px-5 py-3 text-sm font-bold" data-testid="button-auth-required">Connect Wallet / Create Account</button>}
        />
      </div>
      <WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo={returnTo} />
    </AppShell>;
  }

  return <>{children}</>;
}

function SessionLifecycle() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (disposed) return;
        if (event === 'SIGNED_OUT') {
          void fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
          }).then((response) => {
            if (!response.ok) throw new Error('The CHOG MATE session could not be cleared.');
            queryClient.clear();
            queryClient.setQueryData(getGetAuthSessionQueryKey(), { authenticated: false });
          }).catch(() => {
            queryClient.setQueryData(getGetAuthSessionQueryKey(), { authenticated: false });
          });
          return;
        }
        if (event === 'SIGNED_IN') {
          void queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }
      }, 0);
    });

    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionLifecycle />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
