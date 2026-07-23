import { dewiki } from '@plurid/plurid-themes';
import styled from 'styled-components';

export const StyledPopup = styled.main<{ $active: boolean }>`
    box-sizing: border-box;
    display: grid;
    place-content: center;
    justify-items: center;
    width: 320px;
    min-height: 220px;
    padding: 32px;
    gap: 16px;
    color: white;
    background: ${({ $active }) => ($active ? '#000' : '#f00')};
    line-height: 1.5;
    text-align: center;

    h1,
    p {
        margin: 0;
    }

    h1 {
        margin-bottom: 16px;
        font-size: 14px;
        font-weight: 400;
    }

    a {
        color: white;
        text-decoration: none;
    }
`;

export const Introduction = styled.p`
    max-width: 250px;
    font-size: 12px;
`;

export const ModeControl = styled.div`
    display: flex;
    width: 100%;
    margin: 8px 0;
`;

export const ModeButton = styled.button<{
    $active: boolean;
    $location: 'left' | 'right';
}>`
    width: 100%;
    min-width: 120px;
    height: 40px;
    border: 0;
    border-radius: ${({ $location }) => ($location === 'left' ? '30px 0 0 30px' : '0 30px 30px 0')};
    color: white;
    background: ${({ $active }) =>
        $active ? dewiki.backgroundColorTertiary : dewiki.backgroundColorQuaternary};
    box-shadow: ${dewiki.boxShadowPenumbra};
    cursor: ${({ $active }) => ($active ? 'default' : 'pointer')};
    font: inherit;

    &:focus-visible {
        outline: 2px solid white;
        outline-offset: -4px;
    }
`;

export const SettingRow = styled.div`
    display: grid;
    grid-template-columns: minmax(76px, 1fr) 150px;
    align-items: center;
    width: 100%;
    gap: 16px;
    text-align: left;

    > span:last-child {
        justify-self: end;
    }
`;

export const SettingLabel = styled.div`
    display: grid;
    font-size: 12px;

    span:last-child {
        color: rgba(255, 255, 255, 0.72);
        font-size: 10px;
    }
`;

export const StatusText = styled.p<{ $error?: boolean }>`
    min-height: 18px;
    max-width: 250px;
    color: ${({ $error }) => ($error ? '#ffd2d2' : '#ffffff')};
    font-size: 12px;
`;

export const inputStyle = {
    width: '250px',
};
