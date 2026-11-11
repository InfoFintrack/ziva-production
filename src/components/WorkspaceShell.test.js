import React,{useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import WorkspaceShell,{WorkspacePane} from './WorkspaceShell';
beforeEach(()=>window.history.replaceState(null,'','/'));
function Example({onPick=()=>{}}){const [query,setQuery]=useState('');return <WorkspaceShell title="Test workspace" query={query} onQueryChange={setQuery} searchItems={[{id:'po-94',pane:'orders',label:'PO-94',detail:'Oxford order',onSelect:onPick}]}><WorkspacePane id="overview" label="Overview"><p>Overview content</p></WorkspacePane><WorkspacePane id="orders" label="Orders"><p>Order content</p></WorkspacePane></WorkspaceShell>;}
test('only the selected section renders and sidebar supports arrow navigation',()=>{
 render(<Example/>);expect(screen.queryByText('Order content')).toBeNull();
 const overview=screen.getByRole('tab',{name:'Overview'});overview.focus();fireEvent.keyDown(overview,{key:'ArrowDown'});
 expect(screen.getByRole('tab',{name:'Orders'}).getAttribute('aria-selected')).toBe('true');expect(screen.getByText('Order content')).toBeTruthy();expect(screen.queryByText('Overview content')).toBeNull();
});
test('workspace search jumps to the matching record and can clear the filter',()=>{
 const pick=jest.fn();render(<Example onPick={pick}/>);const search=screen.getByRole('searchbox',{name:'Search workspace'});
 fireEvent.change(search,{target:{value:'PO-94'}});fireEvent.click(screen.getByRole('button',{name:/PO-94 Oxford order/}));
 expect(pick).toHaveBeenCalledTimes(1);expect(screen.getByText('Order content')).toBeTruthy();expect(search.value).toBe('PO-94');
 fireEvent.click(screen.getByRole('button',{name:'Clear workspace search'}));expect(search.value).toBe('');
 fireEvent.keyDown(window,{ctrlKey:true,key:'k'});expect(document.activeElement).toBe(search);
});
