package it.eolo.verificafwa;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BarometroPlugin.class);   // barometro per misurare il piano (plugin dell'app)
        super.onCreate(savedInstanceState);
    }
}
