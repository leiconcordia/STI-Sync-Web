import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { ensureEdmsAccess } from './modules/documents/services/edms-api.service';

export default function App() {
  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user) ensureEdmsAccess().catch((error) => console.warn('[EDMS access]', error.message));
  }), []);
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors />
    </>
  );
}
