export default function VerifyScreen({ email }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-6 bg-void">
      <div className="text-center">
        <div className="font-display text-4xl text-gold mb-4" aria-hidden="true">✓</div>
        <h2 className="font-display text-lg text-bright tracking-wider">Check your email</h2>
        <p className="text-dim font-body text-sm mt-2">
          A sign-in link has been sent to<br />
          <span className="text-text">{email}</span>
        </p>
      </div>
      <p className="text-dim text-xs font-body text-center max-w-xs">
        Click the link in the email to sign in. You can close this tab.
      </p>
    </div>
  )
}
