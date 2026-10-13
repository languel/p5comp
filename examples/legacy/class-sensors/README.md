# Class sensor demo

Ultrasonic: trigger D9, echo D8, VCC 5V, GND. Pot: outer pins GND/5V, center A0. Buttons: D2/D3 to GND, INPUT_PULLUP.

CSV at 9600 baud: distance_cm,pot,button1,button2. Button 1=pressed; distance -1=no echo.

Local demo http://localhost:8769 . Drag in distance/pot cards; hold A/B for buttons. Connect Arduino selects a physical USB port. Tinkercad serial remains separate.

Verified Tinkercad pot and both button press/release channels; local dashboard renders and mouse controls update. Physical USB not tested. Online preview remains blank in harness. p5 1.11.10 is used because 2.3.2 raised a constructor error with p5.webserial.
