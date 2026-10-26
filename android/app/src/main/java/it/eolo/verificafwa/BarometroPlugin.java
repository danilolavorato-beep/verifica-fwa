package it.eolo.verificafwa;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Barometro del telefono: media della pressione (hPa) per qualche secondo.
 * Due letture (al portone e in casa) danno il dislivello e quindi il piano del cliente.
 */
@CapacitorPlugin(name = "Barometro")
public class BarometroPlugin extends Plugin implements SensorEventListener {
    private SensorManager sm;
    private Sensor sensore;
    private PluginCall attesa;
    private double somma;
    private int campioni;
    private long fine;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        sensore = sm != null ? sm.getDefaultSensor(Sensor.TYPE_PRESSURE) : null;
    }

    @PluginMethod
    public void disponibile(PluginCall call) {
        JSObject r = new JSObject();
        r.put("disponibile", sensore != null);
        call.resolve(r);
    }

    @PluginMethod
    public void leggi(PluginCall call) {
        if (sensore == null) { call.reject("Il telefono non ha un barometro"); return; }
        if (attesa != null) { call.reject("Misura gia' in corso"); return; }
        int ms = call.getInt("millisecondi", 3000);
        attesa = call; somma = 0; campioni = 0; fine = System.currentTimeMillis() + ms;
        sm.registerListener(this, sensore, SensorManager.SENSOR_DELAY_GAME);
        // se il sensore non manda dati si chiude comunque
        final PluginCall questa = call;
        h.postDelayed(() -> { if (attesa == questa) chiudi(); }, ms + 2000L);
    }

    private void chiudi() {
        if (attesa == null) return;
        sm.unregisterListener(this);
        PluginCall c = attesa; attesa = null;
        if (campioni == 0) { c.reject("Il barometro non ha dato letture"); return; }
        JSObject r = new JSObject();
        r.put("hPa", somma / campioni);
        r.put("campioni", campioni);
        c.resolve(r);
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (attesa == null) return;
        somma += e.values[0]; campioni++;
        if (System.currentTimeMillis() >= fine) chiudi();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
