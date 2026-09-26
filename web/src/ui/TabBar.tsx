import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const TABS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/', label: 'Cook', icon: 'cook', end: true },
  { to: '/pantry', label: 'Pantry', icon: 'pantry' },
  { to: '/shopping', label: 'Shopping', icon: 'shopping' },
  { to: '/eaten', label: 'Eaten', icon: 'eaten' },
];

export function TabBar() {
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => {
            // a recipe opened from Cook still belongs to Cook
            const cookish = tab.to === '/' && /^\/recipes/.test(window.location.pathname);
            return `tab${isActive || cookish ? ' active' : ''}`;
          }}
        >
          <Icon name={tab.icon} size={24} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
