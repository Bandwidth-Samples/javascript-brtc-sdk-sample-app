import React, {JSX} from "react";

import '../css/DigitGrid.scss';

function Digit({number, letters, onClick}: {number: number | string; letters: string; onClick: () => void}): JSX.Element {
    return (
        <div className='digit' onClick={onClick}>
            <div className='digit-number'>{number}</div>
            <div className='digit-letters'>{letters}</div>
        </div>
    );
}

function DigitGrid({ onClick } : {onClick: (arg0: string) => void}) {
    return (
        <div className='digit-grid'>
            <Digit number={1} letters={'\u200E'} onClick={() => onClick('1')}/>
            <Digit number={2} letters={'ABC'} onClick={() => onClick('2')}/>
            <Digit number={3} letters={'DEF'} onClick={() => onClick('3')}/>
            <Digit number={4} letters={'GHI'} onClick={() => onClick('4')}/>
            <Digit number={5} letters={'JKL'} onClick={() => onClick('5')}/>
            <Digit number={6} letters={'MNO'} onClick={() => onClick('6')}/>
            <Digit number={7} letters={'PQRS'} onClick={() => onClick('7')}/>
            <Digit number={8} letters={'TUV'} onClick={() => onClick('8')}/>
            <Digit number={9} letters={'WXYZ'} onClick={() => onClick('9')}/>
            <Digit number={'*'} letters={''} onClick={() => onClick('*')}/>
            <Digit number={0} letters={'+'} onClick={() => onClick('0')}/>
            <Digit number={'#'} letters={''} onClick={() => onClick('#')}/>
        </div>
    );
}

export default DigitGrid;
