// Ambient types for the explicit browser build import used in useMqtt.ts.
// The subpath has no bundled .d.ts, so we borrow the real types from "mqtt".
declare module "mqtt/dist/mqtt.esm" {
  import type { MqttClient, IClientOptions } from "mqtt";
  export function connect(url: string, opts?: IClientOptions): MqttClient;
  const mqtt: { connect: typeof connect };
  export default mqtt;
}
