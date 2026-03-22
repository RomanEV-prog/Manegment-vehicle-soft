/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: `/` | `/(auth)` | `/(auth)/login` | `/(tabs)` | `/(tabs)/` | `/(tabs)/dtc` | `/(tabs)/obd` | `/(tabs)/profile` | `/(tabs)/service` | `/(tabs)/sw` | `/(tabs)/vehicles` | `/_sitemap` | `/alarms` | `/dtc` | `/dtc/new` | `/login` | `/obd` | `/profile` | `/service` | `/sw` | `/sw-updates/new` | `/vehicles`;
      DynamicRoutes: `/vehicles/${Router.SingleRoutePart<T>}`;
      DynamicRouteTemplate: `/vehicles/[id]`;
    }
  }
}
