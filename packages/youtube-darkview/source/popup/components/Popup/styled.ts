// #region imports
    // #region libraries
    import styled from 'styled-components';

    import {
        dewiki,
    } from '@plurid/plurid-themes';
    // #endregion libraries
// #endregion imports



// #region module
export const StyledPopup = styled.div`
    h1 {
        font-size: 14px;
        font-weight: 400;
        margin-bottom: 2rem;
    }

    a {
        color: white;
        text-decoration: none;
    }

    display: grid;
    place-content: center;
    justify-items: center;
    padding: 2rem;
    grid-gap: 1rem;
    line-height: 1.5;
`;


export const inputStyle = {
    width: '250px',
};


export const typeButtonStyle = (
    active: boolean,
    location: 'left' | 'right',
) => ({
    width: '100%',
    minWidth: '120px',
    height: '40px',
    marginTop: '1rem',
    marginBottom: '1rem',
    cursor: active ? 'default' : 'pointer',
    backgroundColor: active ? dewiki.backgroundColorTertiary : dewiki.backgroundColorQuaternary,
    boxShadow: dewiki.boxShadowPenumbra,
    color: 'white',
    border: 'none',
    borderTopLeftRadius: location === 'left' ? '30px' : '0px',
    borderBottomLeftRadius: location === 'left' ? '30px' : '0px',
    borderTopRightRadius: location === 'right' ? '30px' : '0px',
    borderBottomRightRadius: location === 'right' ? '30px' : '0px',
});


export const sliderStyle = {
    display: 'flex',
    gap: '2rem',
    justifyContent: 'space-between',
    width: '100%',
};
// #endregion module
