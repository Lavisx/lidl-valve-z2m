/// Inspired by https://gist.github.com/drdownload/b720bd1b179db04aea9cacb7d7360b46
//// Usage: 
// lidl_radiator_valve.js in the root of your zigbee2mqtt data folder (as stated in data_path, e.g. /config/zigbee2mqtt_data)
// In your zigbee2mqtt hassio addon configuration, add the following two lines:
// ...
// external_converters:
//   - lidl_radiator_valve.js
// ...
const fz = {...require('zigbee-herdsman-converters/converters/fromZigbee'), legacy: require('zigbee-herdsman-converters/lib/legacy').fromZigbee};
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const globalStore = require('zigbee-herdsman-converters/lib/store');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const e = exposes.presets;
const ea = exposes.access;

const tuyaLocal = {
	dataPoints: {
    // LIDL
    zsHeatingSetpoint: 16,
    zsChildLock: 40,
    zsTempCalibration: 104,
    zsLocalTemp: 24,
    zsBatteryVoltage: 35,
    zsComfortTemp: 101,
    zsEcoTemp: 102,
    zsHeatingSetpointAuto: 105,
    zsOpenwindowTemp: 116,
    zsOpenwindowTime: 117,
    zsErrorStatus: 45,
    zsMode: 2,
    zsAwaySetting: 103,
    zsBinaryOne: 106,
    zsBinaryTwo: 107,

	},
};
const fzLocal = {
    zs_thermostat: {
        cluster: 'manuSpecificTuya',
        type: ['commandGetData', 'commandSetDataResponse'],
        convert: (model, msg, publish, options, meta) => {
            const dp = msg.data.dp;
            const value = tuya.getDataValue(msg.data.datatype, msg.data.data);

            // if (dp >= 101 && dp <=107) return; // handled by tuya_thermostat_weekly_schedule

            switch (dp) {

            case tuyaLocal.dataPoints.zsChildLock:
                return {child_lock: value ? 'LOCK' : 'UNLOCK'};

            case tuyaLocal.dataPoints.zsHeatingSetpoint:
                const ret = {};
                if (value==0) ret.system_mode='off';
                if (value==60) { 
                    ret.system_mode='heat';
                    ret.preset = 'boost';
                }
                
                ret.current_heating_setpoint= (value / 2).toFixed(1);
                if (value>0 && value<60) globalStore.putValue(msg.endpoint, 'current_heating_setpoint', ret.current_heating_setpoint);
                return ret;
            case tuyaLocal.dataPoints.zsHeatingSetpointAuto:
                return {current_heating_setpoint_auto: (value / 2).toFixed(1)};
                
            case tuyaLocal.dataPoints.zsOpenwindowTemp:
                return {detectwindow_temperature: (value / 2).toFixed(1)};
                
            case tuyaLocal.dataPoints.zsOpenwindowTime:
                return {detectwindow_timeminute: value};
                
            case tuyaLocal.dataPoints.zsLocalTemp:
                return {local_temperature: (value / 10).toFixed(1)};

            case tuyaLocal.dataPoints.zsBatteryVoltage:
                 return {voltage: Math.round(value * 10)};
            
            case tuyaLocal.dataPoints.zsTempCalibration:
                return {local_temperature_calibration: value > 55 ?
                    ((value - 0x100000000)/10).toFixed(1): (value/ 10).toFixed(1)};

            case tuyaLocal.dataPoints.zsBinaryOne:
                return {binary_one: value ? 'ON' : 'OFF'};
            
            case tuyaLocal.dataPoints.zsBinaryTwo:
                return {binary_two: value ? 'ON' : 'OFF'};


            case tuyaLocal.dataPoints.zsComfortTemp:
                const temp =  (value / 2).toFixed(1);
                return {comfort_temperature: temp};

            case tuyaLocal.dataPoints.zsEcoTemp:
                return {eco_temperature: (value / 2).toFixed(1)};

            case tuyaLocal.dataPoints.zsAwayTemp:
                return {away_preset_temperature: (value / 2).toFixed(1)};

            case tuyaLocal.dataPoints.zsMode:
                switch (value) {
                case 1: // manual
                    return {system_mode: 'heat', away_mode: 'OFF', preset: 'manual'};
                case 2: // away
                    return {system_mode: 'auto', away_mode: 'ON', preset: 'holiday'};
                case 0: // auto
                    return {system_mode: 'auto', away_mode: 'OFF', preset: 'schedule'};
                default:
                    meta.logger.warn('zigbee-herdsman-converters:zsThermostat: ' +
                        `preset ${value} is not recognized.`);
                    break;
                }
                break;

            //case tuya.dataPoints.runningState:
            //    return {running_state: value ? 'heat' : 'idle'};
            case 109:
            case 110:
            case 111:
            case 112:
            case 113:
            case 114:
            case 115:
                break;
            case tuyaLocal.dataPoints.zsAwaySetting:
                const retap = {};
                retap.away_preset_year = value[0];
                retap.away_preset_month = value[1];
                retap.away_preset_day = value[2];
                retap.away_preset_hour = value[3];
                retap.away_preset_minute = value[4];
                retap.away_preset_temperature = (value[5] / 2).toFixed(1);
                retap.away_preset_days = (value[6]<<8)+value[7];
                return retap;
            default:
                meta.logger.warn(`zigbee-herdsman-converters:zsThermostat: Unrecognized DP #${
                    dp} with data ${JSON.stringify(msg.data)}`);
            }
        },
    },
};
const tzLocal = {
    zs_thermostat_child_lock: {
        key: ['child_lock'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, tuyaLocal.dataPoints.zsChildLock, value === 'LOCK');
        },
    },
    zs_thermostat_binary_one: {
        key: ['binary_one'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, tuyaLocal.dataPoints.zsBinaryOne, value === 'ON');
        },
    },
    zs_thermostat_binary_two: {
        key: ['binary_two'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, tuyaLocal.dataPoints.zsBinaryTwo, value === 'ON');
        },
    },
    zs_thermostat_current_heating_setpoint: {
        key: ['current_heating_setpoint'],
        convertSet: async (entity, key, value, meta) => {
            var temp = Math.round(value * 2);
            if (temp<=0) temp = 1
            if (temp>=60) temp = 59
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpoint, temp);
        },
    },
    zs_thermostat_current_heating_setpoint_auto: {
        key: ['current_heating_setpoint_auto'],
        convertSet: async (entity, key, value, meta) => {
            var temp = Math.round(value * 2);
            if (temp<=0) temp = 1
            if (temp>=60) temp = 59
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpointAuto, temp);
        },
    },
    zs_thermostat_comfort_temp: {
        key: ['comfort_temperature'],
        convertSet: async (entity, key, value, meta) => {
            meta.logger.debug(JSON.stringify(entity));
            const temp = Math.round(value * 2);
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsComfortTemp, temp);
        },
    },
    zs_thermostat_openwindow_temp: {
        key: ['detectwindow_temperature'],
        convertSet: async (entity, key, value, meta) => {
            var temp = Math.round(value * 2);
            if (temp<=0) temp = 1
            if (temp>=60) temp = 59
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsOpenwindowTemp, temp);
        },
    },
    zs_thermostat_openwindow_time: {
        key: ['detectwindow_timeminute'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsOpenwindowTime, value);
        },
    },
    zs_thermostat_eco_temp: {
        key: ['eco_temperature'],
        convertSet: async (entity, key, value, meta) => {
            const temp = Math.round(value * 2);
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsEcoTemp, temp);
        },
    },
    zs_thermostat_preset_mode: {
        key: ['preset'],
        convertSet: async (entity, key, value, meta) => {
            const lookup = {'schedule': 0, 'manual': 1, 'holiday': 2};
            if (value == 'boost') {
                await tuya.sendDataPointEnum(entity, tuyaLocal.dataPoints.zsMode, lookup['manual']);
                await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpoint, 60);
            } else {
                await tuya.sendDataPointEnum(entity, tuyaLocal.dataPoints.zsMode, lookup[value]);
                if (value == 'manual') {
                    const temp = globalStore.getValue(entity, 'current_heating_setpoint');
                    await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpoint, temp ? Math.round(temp * 2) : 43 );
                }
                
            }
        },
    },
    zs_thermostat_system_mode: {
        key: ['system_mode'],
        convertSet: async (entity, key, value, meta) => {
            if (value == 'off') {
                await tuya.sendDataPointEnum(entity, tuyaLocal.dataPoints.zsMode, 1);
                await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpoint, 0);
            } else if (value == 'auto') {
                await tuya.sendDataPointEnum(entity, tuyaLocal.dataPoints.zsMode, 0);
            } else if (value == 'heat') {
                // manual
                const temp = globalStore.getValue(entity, 'current_heating_setpoint');
                await tuya.sendDataPointEnum(entity, tuyaLocal.dataPoints.zsMode, 1);
                await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsHeatingSetpoint, temp ? Math.round(temp * 2) : 43 );
                
            }
        },
    },
    zs_thermostat_local_temperature_calibration: {
        key: ['local_temperature_calibration'],
        convertSet: async (entity, key, value, meta) => {
            if (value > 0) value = value*10;
            if (value < 0) value = value*10 + 0x100000000;
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.zsTempCalibration, value);
        },
    },
    zs_thermostat_away_setting: {
        key: ['away_setting'],
        convertSet: async (entity, key, value, meta) => {
            const result = [];
            for (const attrName of ['away_preset_year', 
                            'away_preset_month', 
                            'away_preset_day',
                            'away_preset_hour', 
                            'away_preset_minute', 
                            'away_preset_temperature',
                            'away_preset_days']) {
                var v = 0;
                if (value.hasOwnProperty(attrName)) {
                    v = value[attrName];
                } else if (meta.state.hasOwnProperty(attrName)) {
                    v = meta.state[attrName];
                }
                switch (attrName) {
                    case 'away_preset_year':
                        if (v<17 || v>99) v = 17;
                        result.push(Math.round(v));
                        break;
                    case 'away_preset_month':
                        if (v<1 || v>12) v = 1;
                        result.push(Math.round(v));
                        break;
                    case 'away_preset_day':
                        const daysInMonth = new Date(2000+result[0], result[1],0).getDate();
                        if (v<1)  {
                            v = 1;
                        } else if (v>daysInMonth) {
                            v = daysInMonth;
                        }
                        result.push(Math.round(v));
                        break;
                    case 'away_preset_hour':
                        if (v<0 || v>23) v = 0;
                        result.push(Math.round(v));
                        break;
                    case 'away_preset_minute':
                        if (v<0 || v>59) v = 0;
                        result.push(Math.round(v));
                        break;
                    case 'away_preset_temperature':
                        if (v<0.5 || v>29.5) v = 17;
                        result.push(Math.round(v * 2));
                        break;
                    case 'away_preset_days':
                        if (v<1 || v>9999) v = 1;
                        result.push((v & 0xff00)>>8);
                        result.push((v & 0x00ff));
                        break;
                }
            };
            
            await tuya.sendDataPointRaw(entity, tuyaLocal.dataPoints.zsAwaySetting, result);
        },
    },
};       
const device = {
    // Moes Tuya Alt Thermostat
    zigbeeModel: ['TS601'],
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE200_chyvmhay'}],
    model: '368308_2010',
    vendor: 'Lidl',
    description: 'Radiator valve with thermostat',
    fromZigbee: [
        //fz.legacy.tuya_thermostat_weekly_schedule,
        fz.ignore_basic_report,
        fz.ignore_tuya_set_time,  // handled in onEvent
        fzLocal.zs_thermostat,
        // fz.tuya_data_point_dump,
    ],
    toZigbee: [
        tzLocal.zs_thermostat_current_heating_setpoint,
        tzLocal.zs_thermostat_child_lock,
        tzLocal.zs_thermostat_comfort_temp,
        tzLocal.zs_thermostat_eco_temp,
        tzLocal.zs_thermostat_preset_mode,
        tzLocal.zs_thermostat_system_mode,
        tzLocal.zs_thermostat_local_temperature_calibration,
        tzLocal.zs_thermostat_current_heating_setpoint_auto,
        tzLocal.zs_thermostat_openwindow_time,
        tzLocal.zs_thermostat_openwindow_temp,
        tzLocal.zs_thermostat_binary_one,
        tzLocal.zs_thermostat_binary_two,
        tzLocal.zs_thermostat_away_setting,
        //tz.tuya_thermostat_weekly_schedule,
        tz.tuya_data_point_test
    ],
    onEvent: tuya.onEventSetLocalTime,
    meta: {tuyaThermostatPreset: {0: 'schedule', 1: 'manual', 2: 'holiday'}, tuyaThermostatSystemMode: {0: 'off', 1: 'heat', 2: 'auto'},
            thermostat: {
                weeklyScheduleFirstDayDpId: 109,
                weeklyScheduleMaxTransitions: 5,
                weeklyScheduleSupportedModes: [1], // bits: 0-heat present, 1-cool present (dec: 1-heat,2-cool,3-heat+cool)
            //    weeklyScheduleConversion: 'saswell',
            },
        },
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        await reporting.bind(endpoint, coordinatorEndpoint, ['genBasic']);
    },
    exposes: [
        e.child_lock(), 
        exposes.numeric('current_heating_setpoint_auto', ea.ALL).withValueMin(0.5)
                        .withValueMax(29.5)
                        .withValueStep(0.5)
                        .withUnit('°C').withDescription('Temperature setpoint automatic'),
        exposes.climate().withSetpoint('current_heating_setpoint', 0.5, 29.5, 0.5)
                        .withLocalTemperature()
                        .withLocalTemperatureCalibration()
                        .withSystemMode(['off', 'heat', 'auto'], ea.STATE_SET) //system mode only: off, heat, auto
                        .withPreset(['schedule', 'manual', 'holiday', 'boost']),
        e.comfort_temperature(), 
        e.eco_temperature(),
        exposes.numeric('detectwindow_temperature', ea.STATE_SET).withUnit('°C').withDescription('Open window detection temperature'),
        exposes.numeric('detectwindow_timeminute', ea.STATE_SET).withUnit('min').withDescription('Open window time in minute'),
        e.battery_voltage(), //e.window_detection(), 
        exposes.binary('binary_one', ea.STATE, 'ON', 'OFF').withDescription('Unknown binary one'),
        exposes.binary('binary_two', ea.STATE, 'ON', 'OFF').withDescription('Unknown binary two'),
        exposes.binary('away_mode', ea.STATE, 'ON', 'OFF').withDescription('Away mode'),
        exposes.composite('away_setting', 'away_setting').withFeature(e.away_preset_days()).setAccess('away_preset_days', ea.ALL)
                        .withFeature(e.away_preset_temperature()).setAccess('away_preset_temperature', ea.ALL)
                        .withFeature(exposes.numeric('away_preset_year', ea.ALL).withUnit('year').withDescription('Start away year 20xx'))
                        .withFeature(exposes.numeric('away_preset_month', ea.ALL).withUnit('month').withDescription('Start away month'))
                        .withFeature(exposes.numeric('away_preset_day', ea.ALL).withUnit('day').withDescription('Start away day'))
                        .withFeature(exposes.numeric('away_preset_hour', ea.ALL).withUnit('hour').withDescription('Start away hours'))
                        .withFeature(exposes.numeric('away_preset_minute', ea.ALL).withUnit('min').withDescription('Start away minutes')),
            ],
};

module.exports = device;
