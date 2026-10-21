import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { AuthProvider } from './app/providers';
import { App } from './app/App';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 20000, refetchOnWindowFocus: false } },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster richColors position="bottom-right" />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
