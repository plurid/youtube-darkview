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

    import {
        getActiveTab,
    } from '~logic/utilities';
    // #endregion external


    // #region internal
    import {
        StyledPopup,
        inputStyle,
        typeButtonStyle,
        sliderStyle,
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
    const activate = async () => {
        try {
            setActivated(value => !value);
            const tab = await getActiveTab();
            await chrome.tabs.sendMessage(tab.id, {
                type: 'TOGGLE',
            });
        } catch (error) {
            return;
        }
    }

    const reset = () => {
        setType(defaultOptions.type);
        setThreshold(defaultOptions.threshold);
        setLevel(defaultOptions.level);
        setBlockSize(defaultOptions.blockSize);
    }
    // #endregion handlers


    // #region effects
    /** Load */
    useEffect(() => {
        const load = async () => {
            try {
                const data = await chrome.storage.local.get(OPTIONS_KEY);
                if (!data || !data[OPTIONS_KEY]) {
                    setLoading(false);
                    return;
                }

                const {
                    type,
                    blockSize,
                    level,
                    threshold,
                } = data[OPTIONS_KEY] as Options;

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

    /** Save */
    useEffect(() => {
        if (!mounted.current) {
            return;
        }

        const save = async () => {
            try {
                const options: Options = {
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

    /** Mount */
    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        }
    }, []);

    /** Tab Data */
    useEffect(() => {
        const getTabData = async () => {
            try {
                const tab = await getActiveTab();
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'GET_STATE',
                });
                if (!response) {
                    return;
                }

                const {
                    toggled,
                } = response;

                setActivated(!!toggled);
            } catch (error) {
                return;
            }
        }

        getTabData();
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
            style={{
                backgroundColor: activated ? 'black' : '#FF0000',
            }}
        >
            <h1>
                YouTube Darkview
            </h1>

            <div>
                press alt/option (⌥) + D on a YouTube page to activate darkview
            </div>

            <InputSwitch
                name={`${activated ? 'deactivate' : 'activate'} [⌥ + D]`}
                checked={activated}
                atChange={() => {
                    activate();
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
                    ...sliderStyle,
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
                    ...sliderStyle,
                }}
            >
                <div>
                    block size
                </div>

                <Slider
                    name="block size"
                    value={blockSize}
                    atChange={(value) => {
                        setBlockSize(value);
                    }}
                    min={5}
                    max={50}
                    step={5}
                    width={150}
                    theme={dewiki}
                    level={2}
                />
            </div>

            {/* <div
                style={{
                    ...sliderStyle,
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
            </div> */}

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
