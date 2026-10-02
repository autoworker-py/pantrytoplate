import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ToastProvider, Logo } from './ui/kit';
import { TabBar } from './ui/TabBar';
import { AdBanner } from './components/AdBanner';
import { allowSwipeBack } from './lib/native';
import { useEffect } from 'react';
import Login from './screens/Login';
import Onboarding from './screens/Onboarding';
import Reconsent from './screens/Reconsent';
import Cook from './screens/Cook';
import Pantry from './screens/Pantry';
import Recipes from './screens/Recipes';
import RecipeDetail from './screens/RecipeDetail';
import RecipeNew from './screens/RecipeNew';
import AddFood from './screens/AddFood';
import Shopping from './screens/Shopping';
import Eaten from './screens/Eaten';
import SnapFlow from './screens/snap/SnapFlow';
import Settings from './screens/Settings';
import ConfirmEmail from './screens/ConfirmEmail';
import { PrivacyPage, SupportPage } from './screens/PublicPages';
import MakeMeSomething from './screens/order/MakeMeSomething';
import PlanWeek from './screens/plan/PlanWeek';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  // swipe in from the edge to go back, on screens opened from somewhere; not on the tabs
  useEffect(() => allowSwipeBack(location.pathname), [location.pathname]);

  // readable by anyone, signed in or not: the App Store listing links to these
  if (location.pathname === '/privacy') return <PrivacyPage />;
  if (location.pathname === '/support') return <SupportPage />;

  /*
   * Only reached with a token but no cached account (a first launch after
   * signing in elsewhere). Show the room, not a blank page, while it answers.
   */
  if (loading) {
    return (
      <div className="app boot">
        <Logo size={64} />
      </div>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        <div className="app"><Login /></div>
      </ToastProvider>
    );
  }

  /*
   * Three gates before the app proper, in order: a new account types in the
   * code emailed to it, a revised privacy notice must be re-read, then the
   * first-run questions, asked once and skippable.
   */
  if (user.emailConfirmed === false) {
    return (
      <ToastProvider>
        <div className="app"><ConfirmEmail /></div>
      </ToastProvider>
    );
  }

  if (!user.privacyCurrent) {
    return (
      <ToastProvider>
        <div className="app"><Reconsent /></div>
      </ToastProvider>
    );
  }

  if (!user.onboarded) {
    return (
      <ToastProvider>
        <div className="app"><Onboarding /></div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        {/* keyed by path so each screen arrives with the same short settle */}
        <div className="route" key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Cook />} />
            <Route path="/pantry" element={<Pantry />} />
            <Route path="/make" element={<MakeMeSomething />} />
            <Route path="/plan" element={<PlanWeek />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/new" element={<RecipeNew />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/add" element={<AddFood />} />
            <Route path="/shopping" element={<Shopping />} />
            <Route path="/eaten" element={<Eaten />} />
            <Route path="/snap" element={<SnapFlow />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/inventory" element={<Navigate to="/pantry" replace />} />
            <Route path="/diary" element={<Navigate to="/eaten" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <TabBar />
        <AdBanner plus={user.plus} />
      </div>
    </ToastProvider>
  );
}
