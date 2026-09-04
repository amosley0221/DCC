# kotlinx.serialization keeps its generated serializers on the companion; R8
# needs to be told they are reachable or the dynasty fails to parse in release.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
    static **$* *;
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class **$*
-keepclassmembers class <1>$<2> {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.dcc.app.data.**$$serializer { *; }
-keepclassmembers class com.dcc.app.data.** {
    *** Companion;
}
