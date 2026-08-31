#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include<PubSubClient.h>
#include<WiFiClient.h>

//new wifi model
#include <WiFi.h>
const char* ssid = "SpectrumSetup-39";
const char* password = "whatestate668";
const char* mqtt_broker = "broker.emqx.io";
const int mqtt_port = 1883;
const char* topic ="dc_monitor/data";
const char* cmd_topic ="dc_monitor/cmd";
const char* sweep_topic ="dc_monitor/sweep";

Adafruit_INA219 ina219;
WiFiClient netClient;
PubSubClient client(netClient);

// Define the system states
enum SystemState {
    OFF,
    ON,
    OVERLOAD,
    LOCKOUT,
    TEST_MODE
};
SystemState currentState = OFF;   // the one variable, starts as OFF
int currentThreshold = 65;

//pwm
int fanPin = 18;           
const int fanChannel = 0;
int pwmFreq = 5000;        
int pwmResolution = 8;


int relayPin = 23;

//Accumulate electrical energy, starting from 0
double energy_mWh = 0;

//unsigned long means store a large number, in this
 //case we store what time was the last time reading.
unsigned long last_time = 0;

//wifi connection status
bool wifiConnected = false;

//relay module status
bool isLocked = false;
bool relayOn = false;


void reconnect() {
  // Loop until we're reconnected
  while (!client.connected()) 
  {
    Serial.print("Attempting MQTT connection...");
    // Attempt to connect
    if (client.connect("DC_energy_zhhh")) {
      Serial.println("connected");
      // Re-subscribe on every reconnect: the broker drops subscriptions when
      // the session ends.
      if (client.subscribe(cmd_topic)) {
        Serial.print("Subscribed to "); Serial.println(cmd_topic);
      } else {
        Serial.println("Subscribe FAILED");
      }
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      // Wait 5 seconds before retrying
      delay(5000);
    }
  }
}

void calculate_energy(float power_mW);

void callback(char* topic, byte* payload, unsigned int length);

void setup() {
  Serial.begin(115200);//Start the serial
  while (!Serial) {delay(10);}//wait unitll the serial port is ready
  delay(500);
  Serial.println("\n======== Starting INA219 Test =======");
  Wire.begin(21, 22);//Initialize I2C bus
  Serial.println("Scanning I2C bus...");
byte found = 0;
for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
        Serial.print("  Found I2C device at 0x");
        Serial.println(addr, HEX);
        found++;
    }
}
if (found == 0) {
    Serial.println("  >>> No I2C device found! Wiring is broken.");
}
  if (!ina219.begin()) {Serial.println("INA219 not found"); while (1){delay(1000);}}//Initialize the INA219
  
  //wifi connection
  WiFi.begin(ssid, password);
    Serial.println("\nConnecting");
  delay(5000);
    int count = 0;
    while(WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
      if(count++ > 20) {
        Serial.println("\nFailed to connect to WiFi");
        break;
      }
    }
    Serial.printf("\nWiFi Status: %d", WiFi.status());
    wifiConnected = (WiFi.status() == WL_CONNECTED);//means true
    if (wifiConnected) 
    {
      Serial.printf("\n local adress: ");
      Serial.println(WiFi.localIP());
    }
    else 
    {
      Serial.println("\nWiFi not connected can't get local address");
    }

    //MQTT connection
    client.setServer(mqtt_broker, mqtt_port);
    client.setCallback(callback);
    // NOTE: subscribe() only works once connected, so it must come *after*
    // connect() succeeds -- otherwise it silently does nothing.
    if(client.connect("DC_energy_zhhh")) {
        Serial.println("Connected to MQTT broker");
        if (client.subscribe(cmd_topic)) {
          Serial.print("Subscribed to "); Serial.println(cmd_topic);
        } else {
          Serial.println("Subscribe FAILED");
        }
    } else {
        Serial.print("Failed to connect to MQTT broker, state: ");
        Serial.println(client.state());
    }

    pinMode(relayPin, OUTPUT);
    digitalWrite(relayPin, LOW);//turn off the relay

    //pwm setup
    ledcSetup(fanChannel, pwmFreq, pwmResolution);
    ledcAttachPin(fanPin, fanChannel);
    ledcWrite(fanChannel, 0);   



  last_time = millis(); 
  
}


void loop() {


  float current_mA = ina219.getCurrent_mA();
  float voltage_V = ina219.getBusVoltage_V();
  float power_mW = ina219.getPower_mW();
  float shuntvoltage_mV = ina219.getShuntVoltage_mV();
  calculate_energy(power_mW);
  Serial.println("========================================");
  Serial.print("Current (mA): "); Serial.println(current_mA);
  Serial.print("Voltage (V): "); Serial.println(voltage_V);
  Serial.print("Power (mW): "); Serial.println(power_mW);
  Serial.print("Shunt Voltage (mV): "); Serial.println(shuntvoltage_mV);
  Serial.print("Accumulated Energy (mWh): "); Serial.println(energy_mWh);
  // Check WiFi and MQTT connection status
  if (wifiConnected) {
    Serial.println("WiFi is connected.");
  } else {
    Serial.println("WiFi is not connected.");
  }
  if (!client.connected()) {
    Serial.println("MQTT is not connected.");
    reconnect();
  } else {
    Serial.println("MQTT is connected.");
  }
  client.loop();// Process incoming MQTT messages

  //Json format for MQTT message
  String payload = "{";
  payload += "\"current_mA\": ";
  payload += current_mA;
  payload += ",\"voltage_V\": ";
  payload += voltage_V;
  payload += ",\"power_mW\": ";
  payload += power_mW;
  payload += ",\"shuntvoltage_mV\": ";
  payload += shuntvoltage_mV;
  payload += ",\"energy_mWh\": ";
  payload += energy_mWh;
  payload += "}";
  client.publish(topic, payload.c_str());
  Serial.print("Published: ");//cofirm messages sent to publish
  Serial.println(payload);




  //if it locked just use the reset button to reset the relay module
  if (Serial.available() > 0) {           // did I type something?
    String command = Serial.readStringUntil('\n');   // read it
    command.trim();                     // remove stray spaces/newline
    // now check what the command is...
    if (command.equalsIgnoreCase("on")) {
        if(currentState == OFF){
          currentState = ON;                    // command to turn on the relay module
        }
        }
    else if (command.equalsIgnoreCase("off")) {
        currentState = OFF;
    }
    else if (command.equalsIgnoreCase("reset")) {
        // only allow reset if in LOCKOUT state
        if (currentState == LOCKOUT) {
            currentState = OFF;               // reset to OFF state
            Serial.println("Reset done. Back to OFF.");
        }
    }
    else if (command.equalsIgnoreCase("test")) {     // test mode to sweep the pwm duty cycle and measure power
    currentState = TEST_MODE;
    Serial.println("Entering TEST_MODE...");
    }
    }

  // State machine handling
  switch (currentState) {

    case OFF:
      ledcWrite(fanChannel, 0);
      break;

    case ON:
      ledcWrite(fanChannel, 255);// turn on the fan at full speed (8-bit max)
      if (current_mA > currentThreshold) {
        currentState = OVERLOAD;
      }
      break;

    case OVERLOAD:
      ledcWrite(fanChannel, 0);
      Serial.println("OVERLOAD! Load cut.");
      currentState = LOCKOUT;
      break;

    case LOCKOUT:
      ledcWrite(fanChannel, 0);
      break;


    case TEST_MODE:
      Serial.println("=== Starting Power Sweep ===");
      Serial.println("duty,voltage,current_mA,power_mW");
      // Tell the dashboard a run is beginning so it can clear the old curve.
      client.publish(sweep_topic, "{\"event\":\"start\"}");
      client.loop();
      //sweep the pwm duty cycle within 15 seconds
      for (int duty = 0; duty <= 255; duty += 15) {
        ledcWrite(fanChannel, duty);   // gradually increase the duty cycle
        client.loop();          // keep the MQTT client alive during the sweep
        delay(800);

        float v = ina219.getBusVoltage_V();
        float i = ina219.getCurrent_mA();
        float p = ina219.getPower_mW();

        Serial.print(duty); Serial.print(",");
        Serial.print(v); Serial.print(",");
        Serial.print(i); Serial.print(",");
        Serial.println(p);

        String sweepMsg = "{";
        sweepMsg += "\"duty\":" + String(duty);
        sweepMsg += ",\"duty_percent\":" + String(duty * 100.0 / 255.0, 1);
        sweepMsg += ",\"voltage_V\":" + String(v, 3);
        sweepMsg += ",\"current_mA\":" + String(i, 2);
        sweepMsg += ",\"power_mW\":" + String(p, 2);
        sweepMsg += "}";
        client.publish(sweep_topic, sweepMsg.c_str());
      }
      ledcWrite(fanChannel, 0);
      currentState = OFF;
      client.publish(sweep_topic, "{\"event\":\"complete\"}");
      client.loop();
      Serial.println("=== Sweep Complete ===");
      break;
  }

  // Keep pumping the MQTT client while we wait out the 1s cycle. A plain
  // delay(1000) leaves incoming commands sitting in the socket buffer and
  // starves the keepalive.
  unsigned long wait_start = millis();
  while (millis() - wait_start < 1000) {
    client.loop();
    delay(20);
  }
}

// Function to calculate energy based on power and time
void calculate_energy(float power_mW) {
  // Get the current time in milliseconds
  unsigned long current_time = millis();

  // Calculate the time difference since the last reading
  unsigned long time_diff = current_time - last_time;
  
  // Update the last_time to the current time
  last_time = current_time;
  
  // Calculate energy in mWh (milliwatt-hours)
  // Energy (mWh) = Power (mW) * Time (hours)
  // Time in hours = time_diff (ms) / (1000 * 60 * 60)
  double time_hours = static_cast<double>(time_diff) / (1000.0 * 60.0 * 60.0);
  energy_mWh += power_mW * time_hours;
}


void callback(char* topic, byte* payload, unsigned int length)
{
  String command = "";
  for (int i = 0; i < length; i++) {
    command += (char)payload[i];//making the payload into a string
  }
  command.trim();// remove stray spaces/newline
  Serial.print(">>> MQTT command received: '"); Serial.print(command);
  Serial.print("' on topic "); Serial.println(topic);
  // now check what the command is...
  if (command.equalsIgnoreCase("on")) {
    if (currentState == OFF)
    { currentState = ON; }
    else { Serial.println("    ignored: 'on' only works from OFF state"); }
  }
  else if (command.equalsIgnoreCase("off")) 
  {
    currentState = OFF;
  }
  else if (command.equalsIgnoreCase("reset")) {
    if (currentState == LOCKOUT) 
    { currentState = OFF;}
    else if(currentState == OVERLOAD) 
    { currentState = OFF;}
    else if(currentState == ON) 
    { currentState = OFF;}
  }
  else if (command.equalsIgnoreCase("test")) {
    currentState = TEST_MODE;
    Serial.println("Entering TEST_MODE...");
  }
}

