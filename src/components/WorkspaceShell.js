import React, {Children, isValidElement, useEffect, useId, useRef, useState} from 'react';
import './WorkspaceShell.css';
import './DashboardPanels.css';
import {ProdFlowMark} from './ProdFlowLogo';

export const matchesSearch = (query, ...values) => {
  const text=values.map(value=>typeof value==='object' ? JSON.stringify(value) : String(value ?? '')).join(' ').toLowerCase();
  return String(query || '').trim().toLowerCase().split(/\s+/).every(word=>text.includes(word));
};
export function WorkspacePane({children}) { return <>{children}</>; }
function panesIn(children) {
  return Children.toArray(children).flatMap(child=>!isValidElement(child)?[]:child.type===WorkspacePane?[child]:child.type===React.Fragment?panesIn(child.props.children):[]);
}
export default function WorkspaceShell({title,subtitle,children,query='',onQueryChange,searchItems=[],links=[],actions,notices,toolbar,embedded=false,activeId,onActiveChange,user}) {
  const panes=panesIn(children), first=panes[0]?.props.id;
  const [internal,setInternal]=useState(first),[collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false);
  const active=panes.some(p=>p.props.id===(activeId ?? internal)) ? (activeId ?? internal) : first;
  const pane=panes.find(p=>p.props.id===active);
  const scope=useId(),searchRef=useRef(null),contentRef=useRef(null),navRef=useRef(null);
  const paneIds=panes.map(p=>p.props.id).join('|');
  const select=(id,clear=true)=>{
    if(onActiveChange)onActiveChange(id);else setInternal(id);
    if(clear)onQueryChange?.('');
    setMobileOpen(false);setSearchOpen(false);
    if(!embedded && window.location.hash!==`#${id}`) window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#${id}`);
  };
  useEffect(()=>{
    const id=decodeURIComponent(window.location.hash.slice(1));
    if(paneIds.split('|').includes(id)) {if(onActiveChange)onActiveChange(id);else setInternal(id);}
    // Parent pane data changes must not reset an active form or selection.
  },[paneIds,onActiveChange]);
  useEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=0;},[active]);
  useEffect(()=>{
    const key=e=>{if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();setSearchOpen(true);}if(e.key==='Escape'){setMobileOpen(false);setSearchOpen(false);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[]);
  useEffect(()=>{if(mobileOpen)navRef.current?.querySelector('[aria-selected="true"]')?.focus();},[mobileOpen]);
  const results=query.trim() ? [
    ...panes.map(p=>({id:`section:${p.props.id}`,pane:p.props.id,label:p.props.label,detail:'Open section',keywords:p.props.description,section:true})),
    ...links.map(link=>({id:'link:'+link.href,label:link.label,detail:'Open workspace',href:link.href})),
    ...searchItems.filter(item=>panes.some(p=>p.props.id===item.pane)),
  ].filter(item=>matchesSearch(query,item.label,item.detail,item.keywords)).slice(0,10) : [];
  const pick=item=>{if(item.href){window.location.assign(item.href);return;}item.onSelect?.();select(item.pane,Boolean(item.section));};
  const navigateKeys=e=>{
    const buttons=Array.from(navRef.current?.querySelectorAll('[role="tab"]') || []),index=buttons.indexOf(document.activeElement);
    let next=index;
    if(e.key==='ArrowDown')next=(index+1)%buttons.length;else if(e.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;
    e.preventDefault();buttons[next]?.focus();buttons[next]?.click();
  };
  return <div className={`executive workspace-shell${embedded?' workspace-embedded':''}${collapsed?' workspace-collapsed':''}`}>
    {mobileOpen && <button className="workspace-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`workspace-sidebar${mobileOpen?' workspace-sidebar-open':''}`} aria-label="Workspace navigation">
      <a className="workspace-brand" href={links[0]?.href || '/controls'}><span className="workspace-brand-mark"><ProdFlowMark size={34}/></span><span className="workspace-label"><b>PRODFLOW</b><small>OPERATIONS WORKSPACE</small></span></a>
      <div className="workspace-sidebar-scroll">
        <div className="workspace-nav-caption workspace-label">{title}</div>
        <nav ref={navRef} role="tablist" aria-label="Workspace sections" aria-orientation="vertical" onKeyDown={navigateKeys}>
          {panes.map((p,index)=><button key={p.props.id} type="button" role="tab" id={`${scope}-tab-${p.props.id}`} aria-controls={`${scope}-pane-${p.props.id}`} aria-selected={active===p.props.id} tabIndex={active===p.props.id?0:-1} title={p.props.label} aria-label={p.props.label} className={`workspace-nav-item${active===p.props.id?' is-active':''}`} onClick={()=>select(p.props.id)}><span className="workspace-nav-icon" aria-hidden="true">{p.props.icon || String(index+1).padStart(2,'0')}</span><span className="workspace-label">{p.props.label}</span>{p.props.badge>0 && <span className="workspace-nav-badge workspace-label">{p.props.badge}</span>}</button>)}
        </nav>
        <div className="workspace-nav-caption workspace-label">WORKSPACES</div>
        <nav aria-label="Other workspaces">{links.map(link=><a key={link.href} className="workspace-nav-link" href={link.href} title={link.label}><span className="workspace-nav-icon" aria-hidden="true">↗</span><span className="workspace-label">{link.label}</span></a>)}</nav>
      </div>
      <footer className="workspace-sidebar-footer"><span className="workspace-avatar">{String(user?.name || title || 'P').slice(0,1)}</span><div className="workspace-label"><strong>{user?.name || 'ProdFlow'}</strong><small>{user?.role || 'Live operations'}</small></div></footer>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <button type="button" className="workspace-mobile-toggle" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(!mobileOpen)}>☰</button>
        <button type="button" className="workspace-desktop-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setCollapsed(!collapsed)}>☷</button>
        <span className="workspace-breadcrumb">{title}<span>/</span><b>{pane?.props.label}</b></span>
        <div className="workspace-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setSearchOpen(false);}}>
          <span aria-hidden="true">⌕</span><input ref={searchRef} type="search" aria-label="Search workspace" placeholder="Search POs, workers, weeks…" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{onQueryChange?.(e.target.value);setSearchOpen(true);}} onKeyDown={e=>{if(e.key==='Enter' && results[0]){e.preventDefault();pick(results[0]);}}}/>
          {query ? <button type="button" aria-label="Clear workspace search" onClick={()=>{onQueryChange?.('');searchRef.current?.focus();}}>×</button> : <kbd>⌘ / Ctrl K</kbd>}
          {searchOpen && query.trim() && <div className="workspace-search-results" aria-label="Search results" style={window.innerWidth<=760 ? {top:(searchRef.current?.getBoundingClientRect().bottom || 48)+10}:undefined}><small>QUICK JUMP · RECORDS & SECTIONS</small>{results.length ? results.map(item=><button type="button" key={item.id} onClick={()=>pick(item)}><strong>{item.label}</strong><span>{item.detail}</span></button>) : <p>No matching records or sections.</p>}<p>Search also filters the records in the current view.</p></div>}
        </div>
        <div className="workspace-top-actions">{actions}</div>
      </header>
      <div className="workspace-notices" aria-live="polite">{notices}</div>
      <main ref={contentRef} className="workspace-content" role="tabpanel" id={`${scope}-pane-${active}`} aria-labelledby={`${scope}-tab-${active}`} tabIndex="0">
        <div className="workspace-page-heading"><div><span className="executive-eyebrow">PRODFLOW / {title}</span><h1>{pane?.props.title || pane?.props.label}</h1><p>{pane?.props.description || subtitle}</p></div><span className="workspace-section-count">{String(panes.findIndex(p=>p.props.id===active)+1).padStart(2,'0')} / {String(panes.length).padStart(2,'0')}</span></div>
        {typeof toolbar==='function' ? toolbar(active) : toolbar}
        {query && <div className="workspace-filter-note">Showing matches for “{query}”<button type="button" onClick={()=>onQueryChange?.('')}>Clear filter</button></div>}
        <div className="workspace-pane-content">{pane?.props.children}</div>
      </main>
      <footer className="workspace-statusbar"><span><i/> ProdFlow workspace</span><span>{pane?.props.label}</span></footer>
    </div>
  </div>;
}
