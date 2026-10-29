package com.qsa.school.network;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.TypeAdapter;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.google.gson.stream.JsonWriter;

import java.io.IOException;

/**
 * Global Gson provider with lenient type adapters to prevent crashes
 * when MySQL TINYINT (1/0) or strings are deserialized into boolean/number fields.
 */
public class GsonHelper {

    private static final TypeAdapter<Boolean> BOOLEAN_ADAPTER = new TypeAdapter<Boolean>() {
        @Override
        public void write(JsonWriter out, Boolean value) throws IOException {
            if (value == null) {
                out.nullValue();
            } else {
                out.value(value);
            }
        }

        @Override
        public Boolean read(JsonReader in) throws IOException {
            JsonToken peek = in.peek();
            if (peek == JsonToken.NULL) {
                in.nextNull();
                return false;
            } else if (peek == JsonToken.BOOLEAN) {
                return in.nextBoolean();
            } else if (peek == JsonToken.NUMBER) {
                return in.nextInt() != 0;
            } else if (peek == JsonToken.STRING) {
                String str = in.nextString();
                return "true".equalsIgnoreCase(str) || "1".equals(str);
            }
            in.skipValue();
            return false;
        }
    };

    private static final Gson GSON_INSTANCE = new GsonBuilder()
            .registerTypeAdapter(Boolean.class, BOOLEAN_ADAPTER)
            .registerTypeAdapter(boolean.class, BOOLEAN_ADAPTER)
            .create();

    public static Gson getGson() {
        return GSON_INSTANCE;
    }
}
