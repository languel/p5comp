volatile int interrupts=0;
void irq(){interrupts++;}
void setup(){
 Serial.begin(9600);Serial1.begin(19200);Serial2.begin(19200);Serial3.begin(19200);
 pinMode(22,OUTPUT);pinMode(53,OUTPUT);pinMode(2,INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(2),irq,FALLING);
 digitalWrite(22,HIGH);digitalWrite(53,HIGH);digitalWrite(13,HIGH);
 analogWrite(5,127);analogWrite(6,100);analogWrite(46,180); // timers 3/4/5
 Serial1.println("UART1");Serial2.println("UART2");Serial3.println("UART3");
}
void loop(){Serial.print(millis());Serial.print(',');Serial.print(analogRead(A15));Serial.print(',');Serial.println(interrupts);delay(100);}
