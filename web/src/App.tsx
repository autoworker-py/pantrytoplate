import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import { Icon } from './components/Icon';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { ReconsentGate } from './components/ReconsentGate';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import AddItem from './pages/AddItem';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import Nutrition from './pages/Nutrition';
import Settings from './pages/Settings';

const TABS: Array<{ to: string; label: string; end: boolean }> = [
  { to: '/', label: 'Home', end: true },
  { to: '/inventory', label: 'Pantry', end: false },
  { to: '/diary', label: 'Diary', end: false },
  { to: '/recipes', label: 'Recipes', end: false },
  { to: '/shopping', label: 'Shopping', end: false },
];

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="empty">Loading…</div>;

  if (!user) {
    return (
      <ToastProvider>
        <Login />
      </ToastProvider>
    );
  }

  /*
   * Two gates before the app proper, in order.
   *
   * A revised privacy notice comes first: past agreement covered the old text,
   * so continuing without re-reading would make the record meaningless. Then
   * the first-run questions, asked once and skippable.
   */
  if (!user.privacyCurrent) {
    return (
      <ToastProvider>
        <ReconsentGate />
      </ToastProvider>
    );
  }

  if (!user.onboarded) {
    return (
      <ToastProvider>
        <Onboarding />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            Pantry <span>to</span> Plate
          </Link>
          <NavLink to="/settings" className="btn-ghost btn-sm" aria-label="Settings">
            <Icon name="gear" size={19} />
          </NavLink>
        </header>

        {/*
          * Only this scrolls. The header and tab bar sit outside it, so a
          * rubber-band bounce at either end moves the list inside its own box
          * rather than dragging the whole page off the web view and revealing
          * the native background behind it.
          */}
        <main className="scroll-area">
          <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/add" element={<AddItem />} />
            <Route path="/diary" element={<Nutrition />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/shopping" element={<ShoppingList />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        </main>

        {/*
          * A floating pill rather than a full-width bar: it reads as an object
          * sitting on the content instead of a wall at the bottom, and it keeps
          * clear of the home indicator on a modern iPhone.
          */}
        {/*
          * Words, no icons. The reference app carries its five destinations on
          * type alone with a rule under the active one — and the label is what
          * people read regardless, so an icon above it only adds noise.
          */}
        <nav className="tabbar" aria-label="Main">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
