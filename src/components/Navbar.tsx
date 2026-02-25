import React from 'react';
import '../css/Navbar.scss';
import BWLogo from '../img/bw-logo.svg';


function Navbar() {
    return (
        <div className='navbar'>
            <img src={BWLogo} className='navbar-img' alt='Bandwidth Logo'/>
            <div className='text'>Bandwidth</div>
        </div>
    );
}

export default Navbar;

