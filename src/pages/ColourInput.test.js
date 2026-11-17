import React,{useRef,useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {ColourInput} from './PPView';
function Example({initial='',required=true}) {
 const [value,setValue]=useState(initial),[valid,setValid]=useState(null),ref=useRef();
 return <><ColourInput ref={ref} label="Colour" value={value} onChange={setValue} required={required}/><button onClick={()=>setValid(ref.current.validate())}>Check</button><output>{String(valid)}</output></>;
}
test('typing a short colour works without choosing a suggestion and stays readable',()=>{
 render(<Example/>);const input=screen.getByRole('textbox',{name:'Colour'});
 fireEvent.focus(input);expect(input.style.background).toBe('rgb(16, 25, 38)');
 fireEvent.change(input,{target:{value:' red '}});fireEvent.blur(input);
 expect(input.value).toBe('Red');fireEvent.click(screen.getByText('Check'));expect(screen.getByRole('status').textContent).toBe('true');
 expect(screen.queryByText(/at least 3/)).toBeNull();
});
test('suggestion selection and submit agree, while required blanks stay invalid',()=>{
 render(<Example/>);const input=screen.getByRole('textbox',{name:'Colour'});
 fireEvent.change(input,{target:{value:'r'}});fireEvent.mouseDown(screen.getByText('Red'));fireEvent.blur(input);
 fireEvent.click(screen.getByText('Check'));expect(screen.getByRole('status').textContent).toBe('true');
 fireEvent.change(input,{target:{value:'   '}});fireEvent.click(screen.getByText('Check'));expect(screen.getByRole('status').textContent).toBe('false');
});
