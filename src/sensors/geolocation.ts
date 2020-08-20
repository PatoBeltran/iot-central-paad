import DeviceInfo from 'react-native-device-info';
import { EventEmitter } from 'events';
import { ISensor, DATA_AVAILABLE_EVENT, getRandom } from './index';
import Geolocation from '@react-native-community/geolocation';

export default class GeoLocation extends EventEmitter implements ISensor {

    private enabled: boolean;
    private simulated: boolean;
    private currentRun: any;

    constructor(public id: string, private interval: number) {
        super();
        this.enabled = false;
        this.simulated = false;
        this.currentRun = null;
    }

    name: string = 'GeoLocation';

    enable(val: boolean): void {
        if (this.enabled === val) {
            return;
        }
        this.enabled = val;
        if (!this.enabled && this.currentRun) {
            this.currentRun.unsubscribe();
        }
        else {
            this.run();
        }
    }
    sendInterval(val: number) {
        if (this.interval === val) {
            return;
        }
        this.interval = val;
        this.enable(false);
        this.enable(true);
    }

    simulate(val: boolean): void {
        if (this.simulated === val) {
            return;
        }
        this.simulated = val;
        if (this.simulated && this.enabled && this.currentRun) {
            this.enable(false);
            this.enable(true);
        }
    }

    async run() {

        let intId: number;
        if (this.simulated) {
            intId = setInterval(function (this: GeoLocation) {
                this.emit(DATA_AVAILABLE_EVENT, this.id, { lat: getRandom(), lon: getRandom() });
            }.bind(this), this.interval);

        }
        else {
            intId = setInterval(function () {
                Geolocation.getCurrentPosition(({ coords }) => {
                    if (coords) {
                        this.emit(DATA_AVAILABLE_EVENT, { lat: coords.latitude, lon: coords.longitude });
                    }
                }, (error) => {
                    if (error) {
                        // handle error
                    }
                });
            }.bind(this), this.interval);
        }
        this.currentRun = {
            unsubscribe: () => {
                clearInterval(intId);
            }
        }


    }

}
