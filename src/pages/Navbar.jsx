
const Navbar = () => {
    return (
        <div className="flex justify-center items-center my-6 md:my-10">
            <div className="flex items-center gap-3">

                {/* BOLO */}
                <span className="google-sans text-white text-3xl md:text-5xl font-black leading-none">
                    BOLO
                </span>

                {/* BY */}
                <span className="google-sans text-white text-base md:text-lg font-semibold leading-none">
                    by
                </span>

                {/* Logo */}
                <img
                    src="/logo/CH White Logo.png"
                    alt="Connect Hear"
                    className="h-5 md:h-8 w-auto object-contain leading-none"
                />

            </div>
        </div>
    )
}

export default Navbar