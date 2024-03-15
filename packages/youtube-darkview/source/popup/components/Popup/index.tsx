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
        Slider,
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
        typeButtonStyle
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
    ] = useState<Options['type']>(defaultOptions.type);

    const [
        threshold,
        setThreshold,
    ] = useState(defaultOptions.threshold);

    const [
        level,
        setLevel,
    ] = useState(defaultOptions.level);

    const [
        blockSize,
        setBlockSize,
    ] = useState(defaultOptions.blockSize);
    // #endregion state


    // #region handlers
    const reset = () => {
        setActivated(false);
        setType(defaultOptions.type);
        setThreshold(defaultOptions.threshold);
        setLevel(defaultOptions.level);
        setBlockSize(defaultOptions.blockSize);
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

            <div
                style={{
                    display: 'flex',
                }}
            >
                <button
                    onClick={() => setType('invert')}
                    style={typeButtonStyle(
                        type === 'invert',
                        'left',
                    )}
                >
                    invert
                </button>
                <button
                    onClick={() => setType('content-aware')}
                    style={typeButtonStyle(
                        type === 'content-aware',
                        'right',
                    )}
                >
                    content-aware
                </button>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '2rem',
                    justifyContent: 'space-between',
                    width: '100%',
                }}
            >
                <div>
                    threshold
                </div>

                <Slider
                    name="threshold"
                    value={threshold}
                    atChange={(value) => {
                        setThreshold(value);
                    }}
                    min={0}
                    max={1}
                    step={0.1}
                    width={150}
                    theme={dewiki}
                    level={2}
                />
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '2rem',
                    justifyContent: 'space-between',
                    width: '100%',
                }}
            >
                <div>
                    level
                </div>

                <Slider
                    name="level"
                    value={level}
                    atChange={(value) => {
                        setLevel(value);
                    }}
                    min={0}
                    max={1}
                    step={0.1}
                    width={150}
                    theme={dewiki}
                    level={2}
                />
            </div>

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
