export type EducatorRegistration = {
  professionalRole: "teacher" | "coordinator";
  displayName: string;
  email: string;
  cpf: string;
  password: string;
  confirmPassword: string;
  subjects: string;
  grades: string;
  stages: string[];
  schoolName: string;
  schoolType: "municipal" | "estadual" | "federal" | "privada" | "outra";
  address: string;
  city: string;
  state: string;
};
const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
export function educatorRegistrationPayload(form: EducatorRegistration) {
  if (form.displayName.trim().length < 2) throw Error("Informe seu nome completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    throw Error("Informe um e-mail válido.");
  if (form.cpf.replace(/\D/g, "").length !== 11) throw Error("Informe seu CPF com 11 dígitos.");
  if (form.password.length < 10 || form.password.length > 200)
    throw Error("Use uma senha de 10 a 200 caracteres.");
  if (form.password !== form.confirmPassword) throw Error("As senhas não coincidem.");
  const subjects = split(form.subjects),
    grades = split(form.grades);
  if (form.professionalRole === "teacher" && (!subjects.length || !grades.length))
    throw Error("Informe as disciplinas e séries em que leciona.");
  if (form.professionalRole === "coordinator" && !form.stages.length)
    throw Error("Selecione as etapas que você coordena.");
  if (
    form.schoolName.trim().length < 2 ||
    form.address.trim().length < 3 ||
    form.city.trim().length < 2
  )
    throw Error("Preencha o nome, endereço e cidade da escola.");
  if (
    ![
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ].includes(form.state.trim().toUpperCase())
  )
    throw Error("Informe a sigla válida do estado da escola.");
  return {
    displayName: form.displayName.trim(),
    email: form.email.trim().toLowerCase(),
    cpf: form.cpf.replace(/\D/g, ""),
    password: form.password,
    institutionName: `Espaço de ${form.displayName.trim()}`.slice(0, 160),
    educatorProfile: {
      professionalRole: form.professionalRole,
      subjects: form.professionalRole === "teacher" ? subjects : [],
      grades: form.professionalRole === "teacher" ? grades : [],
      stages: form.professionalRole === "coordinator" ? form.stages : [],
      school: {
        name: form.schoolName.trim(),
        schoolType: form.schoolType,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
      },
    },
  };
}
export async function registerEducator(apiUrl: string, form: EducatorRegistration) {
  const payload = educatorRegistrationPayload(form);
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "mobile" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Não foi possível criar sua conta.");
  if (body.data?.verificationRequired !== true)
    throw Error(
      "O servidor não confirmou o cadastro. Tente entrar ou reenviar a confirmação de e-mail.",
    );
  return { email: payload.email, professionalRole: form.professionalRole };
}
