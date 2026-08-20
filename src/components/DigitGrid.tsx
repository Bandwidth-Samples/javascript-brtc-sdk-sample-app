import React, {JSX} from "react";

import '../css/DigitGrid.scss';

function Digit({number, letters, onClick, active}: {number: number | string; letters: string; onClick: () => void; active: boolean}): JSX.Element {
    return (
        <div className={`digit${active ? ' digit-sent' : ''}`} onClick={onClick}>
            <div className='digit-number'>{number}</div>
            <div className='digit-letters'>{letters}</div>
        </div>
    );
}

// activeDigit reflects the SDK's onDtmfSent event (the tone actually played on
// the outbound stream), not the click itself, so it also lights up when a
// digit is sent via the sequence input rather than the grid.
function DigitGrid({ onClick, activeDigit } : {onClick: (arg0: string) => void; activeDigit?: string}) {
    return (
        <div className='digit-grid'>
            <Digit number={1} letters={'\u200E'} onClick={() => onClick('1')} active={activeDigit === '1'}/>
            <Digit number={2} letters={'ABC'} onClick={() => onClick('2')} active={activeDigit === '2'}/>
            <Digit number={3} letters={'DEF'} onClick={() => onClick('3')} active={activeDigit === '3'}/>
            <Digit number={4} letters={'GHI'} onClick={() => onClick('4')} active={activeDigit === '4'}/>
            <Digit number={5} letters={'JKL'} onClick={() => onClick('5')} active={activeDigit === '5'}/>
            <Digit number={6} letters={'MNO'} onClick={() => onClick('6')} active={activeDigit === '6'}/>
            <Digit number={7} letters={'PQRS'} onClick={() => onClick('7')} active={activeDigit === '7'}/>
            <Digit number={8} letters={'TUV'} onClick={() => onClick('8')} active={activeDigit === '8'}/>
            <Digit number={9} letters={'WXYZ'} onClick={() => onClick('9')} active={activeDigit === '9'}/>
            <Digit number={'*'} letters={''} onClick={() => onClick('*')} active={activeDigit === '*'}/>
            <Digit number={0} letters={'+'} onClick={() => onClick('0')} active={activeDigit === '0'}/>
            <Digit number={'#'} letters={''} onClick={() => onClick('#')} active={activeDigit === '#'}/>
        </div>
    );
}

export default DigitGrid;
