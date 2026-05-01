import React from 'react'
import { NavLink } from 'react-router-dom'
import { resolveAssetUrl } from '../app/runtime'

type NavItem = {
  to: string
  label: string
}

type AppHeaderProps = {
  storeName: string
  logoUrl: string
  currentUserName?: string
  links: NavItem[]
  onLogoError: () => void
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  storeName,
  logoUrl,
  currentUserName,
  links,
  onLogoError,
}) => (
  <header className="sticky top-0 z-20 border-b border-white/40 bg-[color:rgba(255,248,240,0.7)] backdrop-blur-xl">
    <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 md:px-6">
      <div className="app-header-shell">
        <div className="app-header-top">
          <div className="app-header-brand">
            <div className="app-header-brand-mark">
              {logoUrl ? (
                <img
                  src={resolveAssetUrl(logoUrl)}
                  alt={`Logo de ${storeName}`}
                  className="h-full w-full object-cover"
                  onError={onLogoError}
                />
              ) : (
                <span className="text-base font-bold uppercase tracking-[0.16em] text-brand-700">
                  {(storeName || 'SP').slice(0, 2)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="app-header-eyebrow">Sorveteria POS</p>
              <h1 className="app-header-title">{storeName}</h1>
              <p className="app-header-description">
                Operacao de loja, cozinha e delivery com menos ruido visual.
              </p>
            </div>
          </div>
          <div className="app-header-meta">
            <span className="badge-live">Online</span>
            {currentUserName ? (
              <span className="app-header-user">
                {currentUserName}
              </span>
            ) : null}
          </div>
        </div>

        <div className="app-header-bottom">
          <nav className="app-header-nav scrollbar-none">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {currentUserName ? (
            <div className="app-header-actions">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('sorveteria:logout'))}
                className="ui-button ui-button-secondary ui-button-sm app-header-logout"
              >
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  </header>
)
