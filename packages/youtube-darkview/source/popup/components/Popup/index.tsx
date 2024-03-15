// #region imports
    // #region libraries
    import React, {
        useRef,
        useState,
        useEffect,
    } from 'react';


    import {
        dewiki,
    } from '@plurid/plurid-themes';

    import {
        InputSwitch,
        InputLine,
        LinkButton,
    } from '@plurid/plurid-ui-components-react';
    // #endregion libraries


    // #region internal
    import {
        StyledPopup,
        inputStyle,
    } from './styled';
    // #endregion internal
// #region imports



// #region module
export interface PopupProperties {
}

const Popup: React.FC<PopupProperties> = (
    _properties,
) => {
    // #region references
    const mounted = useRef(false);
    // #endregion references


    // #region state
    const [
        loading,
        setLoading,
    ] = useState(true);

    const [
        activate,
        setActivate,
    ] = useState(true);
    // #endregion state


    // #region handlers
    const reset = () => {
    }
    // #endregion handlers


    // #region effects
    useEffect(() => {
        const load = async () => {
            try {
                setLoading(false);
            } catch (error) {
                setLoading(false);
                return;
            }
        }

        load();
    }, []);

    useEffect(() => {
        if (!mounted.current) {
            return;
        }

        const save = async () => {
            try {
            } catch (error) {
                return;
            }
        }

        save();
    }, [
    ]);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        }
    }, []);
    // #endregion effects


    // #region render
    if (loading) {
        return (
            <StyledPopup
                theme={dewiki}
            >
            </StyledPopup>
        );
    }

    return (
        <StyledPopup
            theme={dewiki}
        >
            <h1>
                YouTube Darkview
            </h1>

            <div>
                press alt/option (⌥) + D on a YouTube page to activate darkview
            </div>

            <InputSwitch
                name="activate [⌥ + D]"
                checked={activate}
                atChange={() => {
                    setActivate(value => !value);
                }}
                theme={dewiki}
                style={{
                    ...inputStyle,
                }}
            />

            {/* type - full / content-aware */}
            {/* threshold - 70% */}
            {/* level - 70% */}
            {/* block size - 30 x 30 px */}
            {/* limit - #ffffff */}

            <div>
                <LinkButton
                    text="reset"
                    atClick={() => {
                        reset();
                    }}
                    theme={dewiki}
                    style={{
                        marginTop: '2rem',
                    }}
                    inline={true}
                />
            </div>
        </StyledPopup>
    );
    // #endregion render
}
// #endregion module



// #region exports
export default Popup;
// #endregion exports
