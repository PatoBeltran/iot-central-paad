import React, { useReducer, useState, useEffect, useRef } from "react";
import { IIoTCClient, IoTCCredentials, IoTCClient, IOTC_CONNECT, IOTC_LOGGING } from "react-native-azure-iotcentral-client";
import { IconProps } from "react-native-elements";
import { Platform } from "react-native";
import { ISensor, DATA_AVAILABLE_EVENT, SENSOR_UNAVAILABLE_EVENT } from "../sensors";
import Battery from "../sensors/battery";
import Gyroscope from "../sensors/gyroscope";
import Accelerometer from "../sensors/accelerometer";
import Barometer from "../sensors/barometer";
import Magnetometer from "../sensors/magnetometer";
import GeoLocation from "../sensors/geolocation";
import { defaults } from './defaults';
import { LOG_DATA, valueof } from "../types";
import EventLogger from "../tools/EventLogger";
import { Log } from "../tools/CustomLogger";


export type SensorProps = {
    id: string,
    value?: any,
    icon?: IconProps,
    enabled: boolean,
    interval: number,
    simulated: boolean,
    unit?: string
}

const AVAILABLE_SENSORS = {
    BATTERY: 'battery',
    ACCELEROMETER: 'accelerometer',
    MAGNETOMETER: 'magnetometer',
    BAROMETER: 'barometer',
    GEOLOCATION: 'geolocation',
    GYROSCOPE: 'gyroscope'
}


const sensorMap: { [id in valueof<typeof AVAILABLE_SENSORS>]: ISensor } = {
    [AVAILABLE_SENSORS.BATTERY]: new Battery(AVAILABLE_SENSORS.BATTERY, 5000),
    [AVAILABLE_SENSORS.GYROSCOPE]: new Gyroscope(AVAILABLE_SENSORS.GYROSCOPE, 5000),
    [AVAILABLE_SENSORS.ACCELEROMETER]: new Accelerometer(AVAILABLE_SENSORS.ACCELEROMETER, 5000),
    [AVAILABLE_SENSORS.BAROMETER]: new Barometer(AVAILABLE_SENSORS.BAROMETER, 5000),
    [AVAILABLE_SENSORS.MAGNETOMETER]: new Magnetometer(AVAILABLE_SENSORS.MAGNETOMETER, 5000),
    [AVAILABLE_SENSORS.GEOLOCATION]: new GeoLocation(AVAILABLE_SENSORS.GEOLOCATION, 5000)
}

export type CentralClient = IIoTCClient | null | undefined;
type ICentralState = { telemetryData: SensorProps[], client: CentralClient };


export type IIoTCContext = ICentralState & {
    connect: (credentials?: IoTCCredentials | null) => Promise<void>,
    disconnect: () => Promise<void>,
    updateTelemetry: (fn: (currentData: SensorProps[]) => SensorProps[]) => void,
    getTelemetryName: (id: string) => string,
    addListener: (eventname: string, listener: (...args: any[]) => void) => void,
    removeListener: (eventname: string, listener: (...args: any[]) => void) => void,
}



const initialState: ICentralState = {
    telemetryData: [],
    client: undefined
}

export const IoTCContext = React.createContext<IIoTCContext>({
    ...initialState,
    connect: (credentials?: IoTCCredentials | null) => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    updateTelemetry: () => { },
    getTelemetryName: (id: string) => '',
    addListener: () => { },
    removeListener: () => { },

});

const connectClient = async function (credentials: IoTCCredentials, eventLogger: EventLogger) {
    Log('Connecting Iotcentral client');
    let iotc = new IoTCClient(credentials.deviceId, credentials.scopeId, IOTC_CONNECT.DEVICE_KEY, credentials.deviceKey, eventLogger);
    if (credentials.modelId) {
        iotc.setModelId(credentials.modelId);
    }
    //iotc.setLogging(IOTC_LOGGING.ALL);
    await iotc.connect(false);
    return iotc;
}


const { Provider } = IoTCContext;
const IoTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const defaultSensors: SensorProps[] = [
        {
            id: AVAILABLE_SENSORS.ACCELEROMETER,
            interval: 5000,
            icon: {
                name: 'rocket-outline',
                type: Platform.select({
                    android: 'material-community',
                    ios: 'ionicon'
                })
            },
            enabled: true, // TODO: auto-enable based on settings
            simulated: defaults.emulator
        },
        {
            id: AVAILABLE_SENSORS.GYROSCOPE,
            interval: 5000,
            enabled: true, // TODO: auto-enable based on settings
            icon: {
                name: 'compass-outline',
                type: Platform.select({
                    android: 'material-community',
                    ios: 'ionicon'
                })
            },
            simulated: defaults.emulator
        },
        {
            id: AVAILABLE_SENSORS.MAGNETOMETER,
            interval: 5000,
            enabled: true, // TODO: auto-enable based on settings
            icon: {
                name: 'magnet-outline',
                type: 'ionicon'
            },
            simulated: defaults.emulator
        },
        {
            id: AVAILABLE_SENSORS.BAROMETER,
            interval: 5000,
            enabled: true, // TODO: auto-enable based on settings
            icon: {
                name: 'weather-partly-cloudy',
                type: 'material-community'
            },
            simulated: defaults.emulator
        },
        {
            id: AVAILABLE_SENSORS.GEOLOCATION,
            interval: 5000,
            enabled: true, // TODO: auto-enable based on settings
            icon: {
                name: 'location-outline',
                type: 'ionicon'
            },
            simulated: defaults.emulator,
            unit:'°'
        },
        {
            id: AVAILABLE_SENSORS.BATTERY,
            interval: 5000,
            enabled: true, // TODO: auto-enable based on settings,
            simulated: defaults.emulator,
            icon: {
                name: Platform.select({
                    android: 'battery-medium',
                    ios: 'battery-half-sharp'
                }) as string,
                type: Platform.select({
                    android: 'material-community',
                    ios: 'ionicon'
                })
            }
        }
    ]

    const [state, setState] = useState<ICentralState>({ client: undefined, telemetryData: defaultSensors });
    const eventLogger = useRef<EventLogger>(new EventLogger(LOG_DATA));


    const updateValues = function (id: string, value: any) {
        setState(current => ({
            ...current, telemetryData: current.telemetryData.map(({ ...sensor }) => {
                if (sensor.id === id) {
                    sensor = { ...sensor, value };
                }
                return sensor;
            })
        }));
    }
    useEffect(() => {
        // update sensors
        state.telemetryData.forEach(telem => {
            const id = telem.id as keyof typeof AVAILABLE_SENSORS;
            (sensorMap[id] as ISensor).simulate(telem.simulated);
            (sensorMap[id] as ISensor).enable(telem.enabled);
            (sensorMap[id] as ISensor).sendInterval(telem.interval);
        });
    }, [state.telemetryData]);

    /**
     * Runs initially to add ux listeners to data_change event
     */
    useEffect(() => {
        Object.values(sensorMap).forEach(s => {
            s.addListener(DATA_AVAILABLE_EVENT, updateValues);
            s.addListener(SENSOR_UNAVAILABLE_EVENT, (sensorId: string) => {
                setState(current => {
                    const index = current.telemetryData.findIndex(s => s.id === sensorId);
                    if (index > -1) {
                        current.telemetryData.splice(index, 1);
                    }
                    return current;
                });
            })
        });
    }, []);



    return (
        <Provider value={{
            ...state,
            updateTelemetry: (fn: (currentData: SensorProps[]) => SensorProps[]) => {
                setState(current => ({ ...current, telemetryData: fn(current.telemetryData) }));
            },
            getTelemetryName: (id: string) => (sensorMap[id].name),
            addListener: (eventname: string, listener: (...args: any[]) => void) => {
                if (eventname === LOG_DATA) {
                    eventLogger.current?.addListener(LOG_DATA, listener);
                }
                else {
                    Object.values(sensorMap).forEach(s => s.addListener(eventname, listener));
                }
            },
            removeListener: (eventname: string, listener: (...args: any[]) => void) => {
                if (eventname === LOG_DATA) {
                    eventLogger.current?.removeListener(LOG_DATA, listener);
                }
                Object.values(sensorMap).forEach(s => s.removeListener(eventname, listener));
            },
            connect: async (credentials?: IoTCCredentials | null) => {
                // disconnect previous client if any
                if (state.client) {
                    await state.client.disconnect();
                }
                //  assign credentials object that can be undefined,null or with value.
                //  the goal is to keep client object aligned to credentials object
                //  cases:
                //  a. credentials == undefined ---> client == undefined
                //     app is not initialized yet
                //  b. credentials == null ---> client == null
                //     app is initialized. credentials are empty. force qr scan
                //  c. credentials ---> client
                //     app is initialized. credentials are valid. client connects

                let client: any = credentials;
                if (credentials) {
                    try {
                        client = await connectClient(credentials, eventLogger.current);
                    }
                    catch (e) {
                        client = null;
                    }
                }
                setState(current => ({ ...current, client }));
            },
            disconnect: async () => {
                if (state.client && state.client.isConnected()) {
                    await state.client.disconnect();
                    setState(current => ({ ...current, client: undefined }));
                }
            }
        }}>
            {children}
        </Provider >
    )
};

export default IoTCProvider;