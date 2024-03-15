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


    // #region external
    import {
        Options,
    } from '~data/interfaces';

    import {
        OPTIONS_KEY,
        defaultOptions,
    } from '~data/constants';
    // #endregion external


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
        activated,
        setActivated,
    ] = useState(false);

    const [
        type,
        setType,
    ] = useState<Options['type']>('content-aware');

    const [
        threshold,
        setThreshold,
    ] = useState(0.6);

    const [
        level,
        setLevel,
    ] = useState(0.6);

    const [
        blockSize,
        setBlockSize,
    ] = useState(20);
    // #endregion state


    // #region handlers
    const reset = () => {
        setActivated(false);
    }
    // #endregion handlers


    // #region effects
    useEffect(() => {
        const load = async () => {
            try {
                const data = await chrome.storage.local.get(OPTIONS_KEY);
                if (!data || !data[OPTIONS_KEY]) {
                    setLoading(false);
                    return;
                }

                const {
                    activated,
                    type,
                    blockSize,
                    level,
                    threshold,
                } = data[OPTIONS_KEY] as Options;

                setActivated(activated);
                setType(type);
                setBlockSize(blockSize);
                setLevel(level);
                setThreshold(threshold);

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
                const options: Options = {
                    activated,
                    type,
                    threshold,
                    level,
                    blockSize,
                };

                await chrome.storage.local.set({
                    [OPTIONS_KEY]: options,
                });
            } catch (error) {
                return;
            }
        }

        save();
    }, [
        activated,
        type,
        threshold,
        level,
        blockSize,
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
                checked={activated}
                atChange={() => {
                    setActivated(value => !value);
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
