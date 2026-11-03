import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ui } from "./ui-styles";
import { createStudentClient, normalizeStudentCode } from "./student-api";
import type { StudentCodeClaim, StudentCodeMatch } from "./student-api";

type Props = {
  apiUrl: string;
  token: string;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onLinked: (claim: StudentCodeClaim) => Promise<void>;
};

// Servers without the access-code routes answer students with 403 on unknown paths.
function explain(error: unknown): never {
  if ((error as { status?: number })?.status === 403)
    throw Error("O servidor ainda não aceita o código do aluno. Use o código da turma.");
  throw error;
}

export default function StudentCodeJoin({ apiUrl, token, busy, run, onLinked }: Props) {
  const [code, setCode] = useState(""),
    [match, setMatch] = useState<StudentCodeMatch | null>(null);
  const client = () => createStudentClient(apiUrl, token);
  return (
    <>
      <Text style={ui.title}>Tenho o código do aluno</Text>
      <Text style={ui.small}>
        Use o código pessoal entregue pelo professor (UFA-XXXXXXXX). O vínculo vale na hora para as
        turmas do seu cadastro.
      </Text>
      <TextInput
        style={ui.input}
        accessibilityLabel="Código do aluno"
        placeholder="UFA-XXXXXXXX"
        maxLength={12}
        autoCapitalize="characters"
        autoCorrect={false}
        value={code}
        onChangeText={(value) => {
          setCode(value.toUpperCase());
          setMatch(null);
        }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={[ui.primary, busy && ui.disabled]}
        onPress={() =>
          void run(async () => {
            const value = normalizeStudentCode(code);
            setCode(value);
            setMatch(
              await client()<StudentCodeMatch>("/api/student/access-code/inspect", { code: value }).catch(
                explain,
              ),
            );
          })
        }
      >
        <Text style={ui.primaryText}>Conferir código</Text>
      </Pressable>
      {match && (
        <View style={ui.card}>
          <Text style={ui.cardTitle}>{match.studentName}</Text>
          <Text style={ui.small}>{match.schoolName}</Text>
          <Text style={ui.text}>
            {match.classes.length
              ? `Turmas: ${match.classes.map((c) => c.className).join(", ")}`
              : "Nenhuma turma matriculada"}
          </Text>
          <Text style={ui.small}>Confira se o nome é o seu antes de continuar.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[ui.primary, busy && ui.disabled]}
            onPress={() =>
              void run(async () => {
                const claim = await client()<StudentCodeClaim>("/api/student/access-code/claim", {
                  code: normalizeStudentCode(code),
                }).catch(explain);
                setCode("");
                setMatch(null);
                await onLinked(claim);
              })
            }
          >
            <Text style={ui.primaryText}>Sou eu, vincular minha conta</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
