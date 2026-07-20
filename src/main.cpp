#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_INA219.h>

Adafruit_INA219 ina219;

//Accumulate electrical energy, starting from 0
double energy_mWh = 0;

//unsigned long means store a large number, in this
 //case we store what time was the last time reading.
unsigned long last_time = 0;


void calculate_energy(float power_mW);

void setup() {
  Serial.begin(115200);//Start the serial
  while (!Serial) {delay(10);}//wait unitll the serial port is ready
  delay(500);
  Serial.println("\n======== Starting INA219 Test =======");
  Wire.begin(21, 22);//Initialize I2C bus
  if (!ina219.begin()) {Serial.println("INA219 not found"); while (1);}//Initialize the INA219
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
  delay(1000);

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